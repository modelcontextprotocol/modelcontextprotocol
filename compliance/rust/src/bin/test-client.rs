use clap::{Arg, Command};
use mcp_compliance_rust::{load_scenarios, ScenarioDefinition};
use mcp_compliance_rust::jsonrpc::*;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command as ProcessCommand, Stdio};
use tokio;
use tracing::{info, error};
use tracing_subscriber;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let matches = Command::new("test-client")
        .about("MCP compliance test client")
        .arg(
            Arg::new("scenario-id")
                .long("scenario-id")
                .value_name("ID")
                .help("Scenario ID to execute")
                .required(true),
        )
        .arg(
            Arg::new("id")
                .long("id")
                .value_name("CLIENT_ID")
                .help("Client identifier (e.g., client1)")
                .required(true),
        )
        .subcommand(
            Command::new("stdio")
                .about("Connect via stdio transport")
                .arg(Arg::new("command").help("Server command").num_args(1..)),
        )
        .get_matches();

    let scenario_id: u32 = matches.get_one::<String>("scenario-id").unwrap().parse()?;
    let client_id = matches.get_one::<String>("id").unwrap();

    let scenarios = load_scenarios()?;
    let scenario = scenarios.scenarios.iter()
        .find(|s| s.id == scenario_id)
        .ok_or_else(|| anyhow::anyhow!("Scenario {} not found", scenario_id))?;

    if !scenario.client_ids.contains(&client_id.to_string()) {
        return Err(anyhow::anyhow!("Client '{}' not found in scenario {}", client_id, scenario_id));
    }

    info!("Executing scenario {}: {}", scenario_id, scenario.description);

    match matches.subcommand() {
        Some(("stdio", sub_matches)) => {
            let args: Vec<String> = sub_matches.get_many::<String>("command")
                .unwrap_or_default()
                .cloned()
                .collect();
            
            if args.is_empty() {
                return Err(anyhow::anyhow!("No server command provided"));
            }

            let mut child = ProcessCommand::new(&args[0])
                .args(&args[1..])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()?;

            let mut stdin = child.stdin.take().unwrap();
            let stdout = child.stdout.take().unwrap();
            let mut reader = BufReader::new(stdout);

            let init_request = JsonRpcRequest {
                jsonrpc: "2.0".to_string(),
                id: Some(json!(1)),
                method: "initialize".to_string(),
                params: Some(json!({
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "RustTestClient",
                        "version": "1.0.0"
                    }
                })),
            };

            writeln!(stdin, "{}", serde_json::to_string(&init_request)?)?;

            let mut response_line = String::new();
            loop {
                response_line.clear();
                reader.read_line(&mut response_line)?;
                let line = response_line.trim();
                if line.starts_with('{') {
                    info!("Initialize response: {}", line);
                    break;
                }
            }

            execute_scenario(&mut stdin, &mut reader, scenario, client_id).await?;

            child.wait()?;
        }
        _ => {
            return Err(anyhow::anyhow!("Only stdio transport supported currently"));
        }
    };

    info!("Scenario {} completed successfully", scenario_id);
    Ok(())
}

async fn execute_scenario(
    stdin: &mut std::process::ChildStdin,
    reader: &mut BufReader<std::process::ChildStdout>,
    scenario: &ScenarioDefinition,
    _client_id: &str,
) -> anyhow::Result<()> {
    match scenario.id {
        1 => {
            let tool_request = JsonRpcRequest {
                jsonrpc: "2.0".to_string(),
                id: Some(json!(2)),
                method: "tools/call".to_string(),
                params: Some(json!({
                    "name": "add",
                    "arguments": {"a": 10, "b": 20}
                })),
            };

            writeln!(stdin, "{}", serde_json::to_string(&tool_request)?)?;

            let mut response_line = String::new();
            loop {
                response_line.clear();
                reader.read_line(&mut response_line)?;
                let line = response_line.trim();
                if line.starts_with('{') {
                    info!("Raw tool call response: {}", line);
                    break;
                }
            }
            let response: JsonRpcResponse = serde_json::from_str(&response_line.trim())?;
            
            if let Some(result) = response.result {
                if let Some(content_array) = result.get("content") {
                    if let Some(first_content) = content_array.get(0) {
                        if let Some(text) = first_content.get("text") {
                            if text == "30" {
                                info!("Scenario 1 passed: got expected result 30");
                            } else {
                                return Err(anyhow::anyhow!("Scenario 1 failed: expected 30, got {}", text));
                            }
                        } else {
                            return Err(anyhow::anyhow!("No text field in content"));
                        }
                    } else {
                        return Err(anyhow::anyhow!("No content in response"));
                    }
                } else {
                    return Err(anyhow::anyhow!("No content field in result"));
                }
            } else {
                return Err(anyhow::anyhow!("No result in response: {:?}", response));
            }
        }
        _ => {
            info!("Scenario {} not fully implemented yet", scenario.id);
        }
    }

    Ok(())
}