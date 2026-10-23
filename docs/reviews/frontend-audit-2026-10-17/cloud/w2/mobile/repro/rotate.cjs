// Skeleton of CollectScreen's return tree (CollectScreen.tsx:474-503) with the same element types and
// positions, so the real React reconciler decides what remounts on a portrait -> landscape switch.
const {createRequire}=require("module");
const req=createRequire("/home/user/deca-mark/mobile/package.json");
const React=req("react"); const TR=req("react-test-renderer");
const h=React.createElement;
const log=[];
function Mounter(name){ return function M(){ React.useEffect(()=>{log.push("mount "+name);return()=>log.push("unmount "+name)},[]); return null; } }
const Map_=Mounter("CollectMap"), Panel=Mounter("panel content"), Status=Mounter("status");
const View=(p)=>h("View",p,p.children);
const KAV=(p)=>h("KAV",p,p.children);
const SafeArea=(p)=>h("SafeArea",p,p.children);
function Screen({side,expanded=false}){
  const map=h(Map_);
  const status=h(Status);
  const panelBlock=expanded?null:h(KAV,null,h(View,null,h(Panel)));
  const header=h(React.Fragment,null,h(View,null),h(View,null));
  return h(SafeArea,null,header,
    side? h(View,{style:"row"},
            h(View,null,h(View,null,map),h(View,null,status)),
            panelBlock)
        : h(View,null,
            h(View,null,map),
            expanded?null:h(View,null,status),
            panelBlock));
}
let r; TR.act(()=>{r=TR.create(h(Screen,{side:false}))});
log.length=0;
TR.act(()=>{r.update(h(Screen,{side:true}))});
console.log("portrait -> landscape:",log.join(" | "));
log.length=0;
TR.act(()=>{r.update(h(Screen,{side:false}))});
console.log("landscape -> portrait:",log.join(" | "));
