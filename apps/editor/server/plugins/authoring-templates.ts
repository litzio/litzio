export function authoringTemplate(id: string, template: "screen" | "chart") {
  if (template === "screen" || template === "chart") return {
    manifest: { name: "측정값", contributes: {
      operations: [],
      screens: [{ id: "measurements", title: "측정값", icon: "ChartColumn", entry: "screen.jsx", primary: true }],
    } },
    source: `export function activate(context) {
  return {
    operations: {
      measurements: () => [10, 18, 12, 24],
    },
    status: () => ({
      available: true,
      message: "Ready"
    }),
    dispose() {},
  };
}\n`,
    screen: `export default function Screen({React, ui, invoke, saveDocument}) {
  const [kind,setKind] = React.useState("line");
  const [values,setValues] = React.useState([]), [error,setError] = React.useState("");
  const rows = values.map((value,time)=>({time,value}));
  return <ui.ScreenLayout description="시간에 따른 측정값" status={<ui.Status tone="neutral" label={values.length ? "불러옴" : "준비"}/>} actions={<>
      <ui.Button variant={values.length ? "outline" : "default"} onClick={()=>invoke("measurements").then(setValues).catch(e=>setError(e.message))}>불러오기</ui.Button>
      <ui.Button variant={values.length ? "default" : "outline"} disabled={!values.length} onClick={()=>saveDocument({name:"measurements.md",authoring:{title:"Measurements",inputs:[{key:"values",blocks:[{kind:"table",rows:[["Value"],...values.map(value=>[String(value)])]}]}]},open:true}).catch(e=>setError(e.message))}>문서로 저장</ui.Button>
    </>}>
    {error && <ui.Notice tone="error">{error}</ui.Notice>}
    {!values.length ? <ui.EmptyState title="측정값을 불러오세요" description="머리 구역에서 불러오기를 누르면 결과를 확인할 수 있습니다."/> : <>
    <ui.Toolbar>
      <ui.Select label="그래프" value={kind} options={[{value:"line",label:"선"},{value:"bar",label:"막대"}]} onValueChange={setKind}/>
    </ui.Toolbar>
    <ui.Toolbar>
      <ui.SummaryCard label="합계" value={values.reduce((a,b)=>a+b,0)}/>
    </ui.Toolbar>
    <ui.Section title="데이터"><ui.Row kind="fact" label="측정 개수">{values.length}</ui.Row><ui.Row kind="fact" label="합계">{values.reduce((a,b)=>a+b,0)}</ui.Row></ui.Section>
    <ui.Chart kind={kind} title="측정값" data={rows} xKey="time" yKey="value" baseline={15}/>
    <ui.DataTable title="측정값" rows={rows} columns={["time","value"]} fields={{time:{type:"number"},value:{type:"number"}}}/>
    </>}
  </ui.ScreenLayout>;
}\n`,
  };
  throw new Error("Unknown screen template");
}
