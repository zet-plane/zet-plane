# Agent Orchestrator — 设计文档

## 职责

系统中唯一主动调用 LLM 的组件。编排事件驱动和定时两种任务，读取 Graph/Knowledge 上下文，把分析结果写回这两个引擎。是平面「无感整理」能力的执行层。

---
