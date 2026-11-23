# LedgerFlow MCP Control Server (`ledgerflow-control`)

A dedicated Model Context Protocol (MCP) server that empowers AI assistants, agents, and automated workflows to directly monitor, inspect, and execute financial operations on the LedgerFlow Enterprise SaaS platform.

---

## 🛠️ Included MCP Tools

| Tool Name | Description | Key Parameters |
| :--- | :--- | :--- |
| **`ledgerflow_health`** | Inspects live 3-server cluster status, load balancer nodes (`server-1`, `server-2`, `server-3`), uptime, and database connectivity. | *None* |
| **`ledgerflow_get_summary`** | Retrieves total net balance, lifetime income, expenses, active accounts, and savings rate in formatted INR (₹). | *None* |
| **`ledgerflow_list_transactions`** | Queries and filters transactions with exact integer paise calculations. | `type`, `category`, `search`, `limit` |
| **`ledgerflow_add_transaction`** | Adds a new expense or income transaction with automatic account balance reconciliation. | `title`, `amount` (INR), `type`, `category`, `method`, `date`, `notes` |
| **`ledgerflow_delete_transaction`** | Deletes a transaction by ID and reverts account balances. | `id` (UUID) |
| **`ledgerflow_get_budgets`** | Inspects monthly budget limits, actual spending, and percentage utilization guardrails. | `monthKey` (`YYYY-MM`) |
| **`ledgerflow_set_budget`** | Configures overall and category-specific budget thresholds. | `overallBudget`, `categoryBudgets`, `monthKey` |
| **`ledgerflow_generate_monthly_report`** | Calculates official monthly report (opening balance, inflow, outflow, closing balance, savings rate). | `monthKey` (`YYYY-MM`) |
| **`ledgerflow_send_monthly_email`** | Dispatches the monthly report to the user's verified registered email address. | `monthKey` (`YYYY-MM`) |

---

## ⚙️ MCP Server Configuration

### 1. Workspace Configuration (`.agents/mcp_config.json` or `mcp_config.json`)

```json
{
  "mcpServers": {
    "ledgerflow": {
      "command": "cmd.exe",
      "args": [
        "/d",
        "/c",
        "npx",
        "tsx",
        "D:\\Downloads\\ledgerflow_expense_tracker\\src\\mcp\\index.ts"
      ],
      "env": {
        "LEDGERFLOW_API_URL": "http://127.0.0.1:4000"
      }
    }
  }
}
```

### 2. Standalone Execution

You can run the MCP server directly over standard I/O (stdio):

```bash
npm run mcp
```

### 3. Using with Claude Desktop / Cursor / Antigravity

Add the server entry to your Claude Desktop config (`claude_desktop_config.json`) or Antigravity config (`~/.gemini/config/mcp_config.json`):

```json
"ledgerflow": {
  "command": "node",
  "args": ["<PATH_TO_PROJECT>/node_modules/.bin/tsx", "<PATH_TO_PROJECT>/src/mcp/index.ts"],
  "env": {
    "LEDGERFLOW_API_URL": "http://127.0.0.1:4000"
  }
}
```
