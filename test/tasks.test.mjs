import assert from "node:assert/strict";
import test from "node:test";
import { TaskHistoryAdapter } from "../src/adapters/tasks.mjs";

test("task history exposes safe workflow references and removes account fields", async () => {
  const client = { async call(request) {
    assert.deepEqual(request.payload, { query: { currentPage: 1, pageSize: 20 } });
    return { data: {
      currentPage: 1,
      pageSize: 20,
      total: 1,
      totalPage: 1,
      datas: [{
        jmAiTaskId: "task-1",
        taskId: "external-1",
        name: "主图批量下载",
        bizCode: "FW_GOODS-1970202",
        bizName: "商品主图批量下载",
        source: "service_marketplace",
        scheduled: 0,
        state: 99,
        stateName: "已完成",
        created: 1,
        modified: 2,
        creator: "private-user",
        detailUrl: "https://ware-agent-pro.pf.jd.com/chat/image-download?threadId=thread-1&runId=run-1",
      }],
    } };
  } };
  const result = await new TaskHistoryAdapter({ client }).list();
  assert.deepEqual(result.tasks[0].workflow, { threadId: "thread-1", runId: "run-1" });
  assert.equal(result.tasks[0].serviceCode, "FW_GOODS-1970202");
  assert.equal(JSON.stringify(result).includes("private-user"), false);
});

test("task history rejects oversized pages", async () => {
  const adapter = new TaskHistoryAdapter({ client: {} });
  await assert.rejects(() => adapter.list({ pageSize: 101 }), { code: "INVALID_TASK_QUERY" });
});
