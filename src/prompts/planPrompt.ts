export interface PlanPromptInput {
  planName: string
  statement: string
  deadline: string
  successCriteria: string
  currentContext: string
}

export function buildPlanCreationPrompt(input: PlanPromptInput): string {
  const request = {
    planName: input.planName,
    finalGoal: input.statement,
    deadline: input.deadline,
    successCriteria: input.successCriteria
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    currentContext: input.currentContext,
  }

  return `あなたは長期目標を実行可能な計画へ分解するアシスタントです。

以下の入力をもとに、Longstepで読み込める全体JSON（kind: "plan"）を作成してください。
数ヶ月〜数年の目標を、前提関係（dependsOn）を持つ中間目標ノードへ分解してください。
各ノードには、その日に取り組む内容がわかるnextActionを設定してください。

出力はJSONコードブロック1つだけにし、説明文は付けないでください。
形式は、添付または提示されたplan-snapshot.schema.jsonに従ってください。

入力:
${JSON.stringify(request, null, 2)}`
}
