pub mod jsonrpc;
pub mod servers;
pub mod client;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Scenarios {
    pub servers: HashMap<String, ServerDefinition>,
    pub scenarios: Vec<ScenarioDefinition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerDefinition {
    pub description: String,
    pub tools: HashMap<String, ToolDefinition>,
    pub resources: HashMap<String, ResourceDefinition>,
    #[serde(rename = "resourceTemplates")]
    pub resource_templates: HashMap<String, ResourceTemplateDefinition>,
    pub prompts: HashMap<String, PromptDefinition>,
    #[serde(rename = "promptTemplates")]
    pub prompt_templates: HashMap<String, PromptTemplateDefinition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolDefinition {
    pub description: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ResourceDefinition {
    pub description: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ResourceTemplateDefinition {
    pub description: String,
    pub params: HashMap<String, ParamDefinition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PromptDefinition {
    pub description: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PromptTemplateDefinition {
    pub description: String,
    pub params: HashMap<String, ParamDefinition>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ParamDefinition {
    pub description: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ScenarioDefinition {
    pub id: u32,
    pub description: String,
    pub client_ids: Vec<String>,
    pub server_name: String,
    #[serde(default)]
    pub http_only: bool,
}

pub fn load_scenarios() -> anyhow::Result<Scenarios> {
    let scenarios_path = std::env::current_dir()?.join("../scenarios/data.json");
    let content = std::fs::read_to_string(&scenarios_path)
        .map_err(|e| anyhow::anyhow!("Failed to read scenarios file at {:?}: {}", scenarios_path, e))?;
    let scenarios: Scenarios = serde_json::from_str(&content)
        .map_err(|e| anyhow::anyhow!("Failed to parse scenarios JSON: {}", e))?;
    Ok(scenarios)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_scenarios() {
        let result = load_scenarios();
        assert!(result.is_ok(), "Should be able to load scenarios");
        
        let scenarios = result.unwrap();
        assert!(scenarios.servers.contains_key("CalcServer"));
        assert!(scenarios.servers.contains_key("FileServer"));
        assert!(scenarios.servers.contains_key("ErrorServer"));
        assert!(!scenarios.scenarios.is_empty());
    }

    #[test]
    fn test_scenario_structure() {
        let scenarios = load_scenarios().unwrap();
        
        for scenario in &scenarios.scenarios {
            assert!(scenario.id > 0);
            assert!(!scenario.description.is_empty());
            assert!(!scenario.client_ids.is_empty());
            assert!(scenarios.servers.contains_key(&scenario.server_name));
        }
    }
}