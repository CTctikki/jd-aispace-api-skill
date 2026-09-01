export const APP_IDS = Object.freeze({
  portal: "YLUC0MIUG39LNW6RQZBN",
  market: "RHF4TRSNMOTM9W9O3UKH",
  workflow: "FYIFKQ8BWEEXWLBKKTRO",
});

export const OPERATIONS = Object.freeze({
  "portal.tools.list": {
    appId: APP_IDS.portal,
    api: "dsm.support.superassist.expertPanelFacadeService.getToolList",
    effect: "read",
  },
  "portal.purchases.list": {
    appId: APP_IDS.portal,
    api: "dsm.fuwu.search.SearchUpgradeDsmProvider.listAiSpacePurchase",
    effect: "read",
  },
  "service.resolve": {
    appId: APP_IDS.market,
    api: "dsm.fuwu.microApp.MicroAppServiceDsmProvider.queryServiceByCode",
    effect: "read",
  },
  "service.use": {
    appId: APP_IDS.market,
    api: "dsm.jmmarket.remoting.dsm.service.MicroAppServiceDsmProvider.useServiceNow",
    effect: "execute",
  },
  "service.auth-code": {
    appId: APP_IDS.market,
    api: "dsm.open.oauth.rpc.MicroAppAuthCodeRpcService.getMicroAppAuthCode",
    effect: "authorize",
  },
  "assistant.conversation.create": {
    appId: APP_IDS.portal,
    api: "dsm.support.superassist.SuperAssistantDialogFacadeService.generateConvId",
    effect: "execute",
  },
  "assistant.message.submit": {
    appId: APP_IDS.portal,
    api: "dsm.support.superassist.SuperAssistantDialogFacadeService.chatSubmit",
    effect: "execute",
  },
  "assistant.answer.stream": {
    appId: APP_IDS.portal,
    api: "dsm.support.center.SuperAssistDialogController.chat.answer",
    effect: "execute",
  },
  "tasks.recent": {
    appId: APP_IDS.portal,
    api: "dsm.work.flow.jm.ai.task.JmAiTaskHomeFacadeService.getRecentHomeJmAiList",
    effect: "read",
  },
  "tasks.list": {
    appId: APP_IDS.portal,
    api: "dsm.work.flow.jm.ai.task.JmAiTaskHomeFacadeService.pageQueryJmAiTask",
    effect: "read",
  },
  "tasks.schedule-records": {
    appId: APP_IDS.portal,
    api: "dsm.work.flow.jm.ai.task.JmAiTaskHomeFacadeService.getJmAiScheduleTaskAndRecordList",
    effect: "read",
  },
  "tasks.result": {
    appId: APP_IDS.portal,
    api: "dsm.agent.api.AgentLogApiService.queryExecuteResult",
    effect: "read",
  },
  "workflow.context": {
    appId: APP_IDS.workflow,
    api: "dsm.workflow.client.api.UserService.getAccessContext",
    effect: "read",
  },
  "workflow.specialist": {
    appId: APP_IDS.workflow,
    api: "dsm.workflow.specialist.specialistService.getSpecialist",
    effect: "read",
  },
  "workflow.version": {
    appId: APP_IDS.workflow,
    api: "dsm.workflow.specialist.runtimeQueryService.getWorkflowVersion",
    effect: "read",
  },
});
