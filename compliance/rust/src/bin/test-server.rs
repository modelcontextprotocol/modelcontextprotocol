use clap::{Arg, Command};
use mcp_compliance_rust::load_scenarios;
use mcp_compliance_rust::jsonrpc::*;
use serde_json::{json, Value};
use std::io::{self, BufRead, BufReader, Write};
use tokio;
use tracing::{info, warn};
use tracing_subscriber;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let matches = Command::new("test-server")
        .about("MCP compliance test server")
        .arg(
            Arg::new("server-name")
                .long("server-name")
                .value_name("NAME")
                .help("Server name (CalcServer, FileServer, ErrorServer)")
                .required(true),
        )
        .arg(
            Arg::new("transport")
                .long("transport")
                .value_name("TRANSPORT")
                .help("Transport type (stdio)")
                .required(true),
        )
        .get_matches();

    let server_name = matches.get_one::<String>("server-name").unwrap();

    info!("Starting {} server", server_name);

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        info!("Received request: {}", line);
        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(req) => req,
            Err(e) => {
                let error_response = JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: None,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32700,
                        message: format!("Parse error: {}", e),
                        data: None,
                    }),
                };
                writeln!(stdout, "{}", serde_json::to_string(&error_response)?)?;
                stdout.flush()?;
                continue;
            }
        };

        let response = match handle_request(server_name, &request).await {
            Ok(result) => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id.clone(),
                result: Some(result),
                error: None,
            },
            Err(e) => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id.clone(),
                result: None,
                error: Some(JsonRpcError {
                    code: -32603,
                    message: e.to_string(),
                    data: None,
                }),
            },
        };

        writeln!(stdout, "{}", serde_json::to_string(&response)?)?;
        stdout.flush()?;
    }

    Ok(())
}

async fn handle_request(server_name: &str, request: &JsonRpcRequest) -> anyhow::Result<Value> {
    match request.method.as_str() {
        "initialize" => {
            Ok(json!({
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "tools": {"listChanged": true},
                    "resources": {"subscribe": true, "listChanged": true},
                    "prompts": {"listChanged": true}
                },
                "serverInfo": {
                    "name": server_name,
                    "version": "1.0.0"
                }
            }))
        }
        "tools/list" => {
            let tools = match server_name {
                "CalcServer" => vec![
                    json!({
                        "name": "add",
                        "description": "Adds two numbers a and b together and returns the sum",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "a": {"type": "number"},
                                "b": {"type": "number"}
                            },
                            "required": ["a", "b"]
                        }
                    })
                ],
                "FileServer" => vec![
                    json!({
                        "name": "write_file",
                        "description": "Writes content to a file at the specified path",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "path": {"type": "string"},
                                "content": {"type": "string"}
                            },
                            "required": ["path", "content"]
                        }
                    })
                ],
                "ErrorServer" => vec![
                    json!({
                        "name": "always_error",
                        "description": "Always returns a tool execution error",
                        "inputSchema": {
                            "type": "object",
                            "properties": {},
                            "additionalProperties": false
                        }
                    })
                ],
                _ => vec![],
            };
            Ok(json!({"tools": tools}))
        }
        "tools/call" => {
            let params: CallToolParams = request.params.as_ref()
                .map(|p| serde_json::from_value(p.clone()))
                .transpose()?
                .ok_or_else(|| anyhow::anyhow!("Missing tool call parameters"))?;

            match (server_name, params.name.as_str()) {
                ("CalcServer", "add") => {
                    let args = params.arguments.unwrap_or(json!({}));
                    let a = args["a"].as_f64().unwrap_or(0.0);
                    let b = args["b"].as_f64().unwrap_or(0.0);
                    Ok(json!({
                        "content": [{"type": "text", "text": (a + b).to_string()}],
                        "isError": false
                    }))
                }
                ("ErrorServer", "always_error") => {
                    Ok(json!({
                        "content": [{"type": "text", "text": "This tool always fails as designed"}],
                        "isError": true
                    }))
                }
                _ => {
                    Ok(json!({
                        "content": [{"type": "text", "text": format!("Unknown tool: {}", params.name)}],
                        "isError": true
                    }))
                }
            }
        }
        _ => {
            Err(anyhow::anyhow!("Unknown method: {}", request.method))
        }
    }
}