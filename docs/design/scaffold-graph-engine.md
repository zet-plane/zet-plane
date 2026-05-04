# Scaffold Graph Engine — 设计文档

## 职责

Graph 结构和节点生命周期的领域服务。只响应外部调用（API Layer 或 Agent Orchestrator），不主动发起任何操作，不调用 LLM。

---