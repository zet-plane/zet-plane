# Knowledge Sedimentation Engine — 设计文档

## 职责

KnowledgeEntry 的领域服务。管理知识条目的生命周期、渐进式修订历史，以及与 Graph 节点和事件的关联关系。不调用 LLM，不主动发起操作。