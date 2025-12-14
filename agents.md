# AI Agent 工作规则

## 代码提交规范

每次修改完代码后，必须执行以下步骤：

1. **编写 Commit Log**：根据修改内容编写清晰、有意义的 commit message
   - 使用简洁的标题描述主要变更
   - 如有必要，在正文中详细说明修改原因和影响
   - 遵循项目现有的 commit message 风格

2. **提交代码**：使用 `git add` 和 `git commit` 提交变更

3. **推送到远程**：使用 `git push origin <branch>` 将代码推送到 origin

## Commit Message 格式

```
[type] 简短描述

详细说明（可选）
```

常用 type：
- `fix`: 修复 bug
- `feat`: 新功能
- `refactor`: 代码重构
- `test`: 添加或修改测试
- `docs`: 文档更新
- `perf`: 性能优化
