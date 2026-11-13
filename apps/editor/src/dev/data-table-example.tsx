import {DataTable} from "../components/DataTable.tsx";
export function TableInteractionExample() {
 return <section className="gallery-table-example" aria-label="Table — 예시: 열별 정렬·필터"><h3>Table — 예시: 열별 정렬·필터</h3><DataTable title="Table — 예시: 열별 정렬·필터" columns={tableColumns} rows={tableRows} fields={{name:{type:"string",linkField:"url"},score:{type:"number"},enabled:{type:"boolean"},date:{type:"string",date:true}}} /></section>;
}
const tableColumns=["name","score","enabled","date"];
const tableRows=Array.from({length:61},(_,i)=>({name:i===58?null:i===59?"":`Item ${i+1}`,url:["https://example.test/issues/1","http://example.test/issues/2","javascript:alert(1)","data:text/html,no","file:///no","","https://",null][i%8],score:i===60?100:i,enabled:i%2===0,date:`2026-11-${String(i%28+1).padStart(2,"0")}T00:00:00.000Z`}));
