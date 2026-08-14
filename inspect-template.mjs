import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(fs.readFileSync(path.join(__dirname, "public","SF2_2025_template-MARCH.xlsx")));
const ws = wb.worksheets[0];

function colLetter(n){let s="";while(n>0){s=String.fromCharCode(64+(n%26||26))+s;n=Math.floor((n-1)/26);}return s;}

console.log("=== ROWS 1-4 (header) ===");
for(let r=1;r<=4;r++){
  ws.getRow(r).eachCell({includeEmpty:false},(cell,col)=>{
    const v=cell.value;
    if(!v&&v!==0)return;
    let d=typeof v==="object"?(v.formula?`={${v.formula}}=>${v.result}`:JSON.stringify(v)):String(v);
    if(!d.trim())return;
    console.log(`  ${colLetter(col)}${r}: ${d.slice(0,120)}`);
  });
}

console.log("\n=== ROW 8 ALL COLS ===");
ws.getRow(8).eachCell({includeEmpty:false},(cell,col)=>{
  const v=cell.value;
  if(!v&&v!==0)return;
  let d=typeof v==="object"?(v.formula?`={${v.formula}}=>${v.result}`:JSON.stringify(v)):String(v);
  if(!d.trim())return;
  console.log(`  ${colLetter(col)}8: ${d.slice(0,100)}`);
});

console.log("\n=== MERGED CELLS (rows 3-7) ===");
ws.mergeCells; // just to trigger access
const merges = ws._merges || {};
Object.keys(merges).forEach(k=>{
  const m = merges[k];
  if(m && m.top && m.top <=7 && m.top >=3){
    console.log(`  Merge: ${colLetter(m.left)}${m.top}:${colLetter(m.right)}${m.bottom}`);
  }
});
console.log("done");
