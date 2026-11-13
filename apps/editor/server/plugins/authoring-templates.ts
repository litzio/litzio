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
  const [values,setValues] = React.useState([]), [error,setError] = React.useState("");
  const rows = values.map((value,time)=>({time,value}));
  return <ui.ScreenLayout description="시간에 따른 측정값">
    <ui.Toolbar>
      <ui.Button onClick={()=>invoke("measurements").then(setValues).catch(e=>setError(e.message))}>불러오기</ui.Button>
      <ui.Button disabled={!values.length} onClick={()=>saveDocument({name:"measurements.md",authoring:{title:"Measurements",inputs:[{key:"values",blocks:[{kind:"table",rows:[["Value"],...values.map(value=>[String(value)])]}]}]},open:true}).catch(e=>setError(e.message))}>문서로 저장</ui.Button>
      <ui.SummaryCard label="합계" value={values.reduce((a,b)=>a+b,0)}/>
    </ui.Toolbar>
    {error && <ui.Notice tone="error">{error}</ui.Notice>}
    <ui.Chart title="측정값" data={rows} xKey="time" yKey="value" baseline={15}/>
    <ui.DataTable title="측정값" rows={rows} columns={["time","value"]} fields={{value:{type:"number"}}}/>
  </ui.ScreenLayout>;
}\n`,
  };
  throw new Error("Unknown screen template");
}
