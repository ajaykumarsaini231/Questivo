export function normalizeLatex(text:string){

if(!text) return "";

return text
.replace(/\\\\\(/g,"\\(")
.replace(/\\\\\)/g,"\\)")
.replace(/\\\\\[/g,"\\[")
.replace(/\\\\\]/g,"\\]")
.replace(/\\\\([a-zA-Z])/g,"\\$1")
.trim();

}