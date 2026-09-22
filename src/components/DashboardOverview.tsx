import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ArrowUpRight, Building2, UsersRound, Sparkles, Database, ArrowRight, Plus, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import type { Lead, CompanyResearch } from "../types";

export function DashboardOverview({ leads, research, language, loading, onNavigate, onNewChat, onRefresh }: {
  leads: Lead[]; research: CompanyResearch[]; language:"en"|"ar"; loading:boolean; onNavigate:(key:string)=>void; onNewChat:()=>void; onRefresh:()=>void;
}) {
  const ar = language === "ar", [days, setDays] = useState("30");
  const consumers = leads.filter((lead) => /b2c/i.test(lead.source)).length;
  const researched = research.filter((report) => report.status === "completed" && leads.some((lead)=>lead.id===report.leadId)).length;
  const points = useMemo(() => {
    const count=Number(days), now=new Date(); now.setHours(0,0,0,0);
    return Array.from({length:count}, (_,i) => {
      const date=new Date(now);date.setDate(date.getDate()-count+1+i);
      const next=new Date(date);next.setDate(next.getDate()+1);
      const dayLeads=leads.filter(lead=> {const time=Date.parse(lead.lastSeenUpdateAt);return time>=date.getTime()&&time<next.getTime();});
      return { date:date.toISOString(), b2b:dayLeads.filter(lead=>!/b2c/i.test(lead.source)).length, b2c:dayLeads.filter(lead=>/b2c/i.test(lead.source)).length };
    });
  },[leads, days]);
  const recent=[...leads].sort((a,b)=>Date.parse(b.lastSeenUpdateAt)-Date.parse(a.lastSeenUpdateAt)).slice(0,5);
  const stats=[
    {label:ar?"إجمالي العملاء":"Total leads",value:leads.length,icon:Database,detail:ar?"فرصك في مكان واحد":"Your pipeline, in one place",note:ar?"من نتائج بحثك المحفوظة":"From your saved search results"},
    {label:ar?"عملاء الشركات":"Business leads",value:leads.length-consumers,icon:Building2,detail:ar?"شركات تناسب طلبك":"Companies for your next move",note:ar?"أبحاث معمّقة متاحة عبر LinkedIn":"LinkedIn-based research available"},
    {label:ar?"عملاء الأفراد":"Consumer leads",value:consumers,icon:UsersRound,detail:ar?"فرص من إشارات فعلية":"Opportunities with real signals",note:ar?"راجع سبب التأهل في قائمة العملاء":"See qualification reasons in Leads"},
    {label:ar?"أبحاث مكتملة":"Research completed",value:researched,icon:Sparkles,detail:ar?"سياق يساعدك في المحادثة":"Context for better conversations",note:ar?"تقارير محفوظة وجاهزة للاستخدام":"Saved dossiers, ready to use"},
  ];
  const activity=points.reduce((sum,p)=>sum+p.b2b+p.b2c,0);
  return <div className="dashboard-overview">
    <header className="dashboard-page-heading"><div><span className="dashboard-eyebrow">{ar?"مساحة العمل":"YOUR WORKSPACE"}</span><h1>{ar?"نظرة عامة":"Workspace overview"}</h1><p>{ar?"ابدأ بمحادثة. حوّل طلبك إلى فرص واضحة.":"Start with a conversation. Turn your brief into your next opportunity."}</p></div><div className="dashboard-heading-actions"><Button variant="outline" size="icon" aria-label={ar?"تحديث":"Refresh"} onClick={onRefresh}><RefreshCw size={15}/></Button><Button onClick={onNewChat}><Plus size={16}/>{ar?"محادثة جديدة":"New conversation"}</Button></div></header>
    <div className="dashboard-metrics">{stats.map(({label,value,icon:Icon,detail,note})=><Card className="dashboard-metric" key={label}><CardHeader><CardDescription>{label}</CardDescription><Badge variant="outline"><Icon size={13}/>{ar?"محفوظ":"Saved"}</Badge><CardTitle>{loading&&!leads.length?"—":value.toLocaleString(ar?"ar-SA":"en-US")}</CardTitle></CardHeader><CardFooter><strong>{detail}<ArrowUpRight size={14}/></strong><span>{note}</span></CardFooter></Card>)}</div>
    <Card className="dashboard-activity"><CardHeader><div><CardTitle>{ar?"نشاط العملاء":"Lead activity"}</CardTitle><CardDescription>{ar?`آخر ${days} يوماً · وفق تاريخ آخر تحديث للعميل`:`Last ${days} days · Based on each lead’s last update`}</CardDescription></div><Tabs dir={ar?"rtl":"ltr"} value={days} onValueChange={setDays}><TabsList>{["90","30","7"].map(day=><TabsTrigger value={day} key={day}>{ar?`آخر ${day} يوم`:`Last ${day} days`}</TabsTrigger>)}</TabsList></Tabs></CardHeader><CardContent><div className="dashboard-chart-legend"><span><i/>B2B</span><span><i/>B2C</span><small>{ar?`${activity} تحديث`:`${activity} updates`}</small></div>
    {activity ? <div className="dashboard-chart" role="img" aria-label={ar?"نشاط العملاء حسب تاريخ التحديث":"Lead activity by update date"}><ResponsiveContainer width="100%" height="100%"><AreaChart data={points} margin={{top:18,right:6,left:6,bottom:0}}><defs><linearGradient id="leadBusiness" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c7c7c7" stopOpacity={0.36}/><stop offset="100%" stopColor="#c7c7c7" stopOpacity={0.015}/></linearGradient><linearGradient id="leadConsumer" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c7c7c" stopOpacity={0.25}/><stop offset="100%" stopColor="#7c7c7c" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#292929"/><XAxis dataKey="date" tickFormatter={(value)=>new Date(value).toLocaleDateString(ar?"ar-SA":"en-GB",{month:"short",day:"numeric"})} axisLine={false} tickLine={false} minTickGap={48} tick={{fontSize:11,fill:"#808080"}}/><Tooltip contentStyle={{background:"#1c1c1c",border:"1px solid #383838",borderRadius:10,fontSize:12}} labelFormatter={(label)=>new Date(String(label)).toLocaleDateString(ar?"ar-SA":"en-GB")}/><Area type="monotone" dataKey="b2b" name="B2B" stroke="#c7c7c7" strokeWidth={1.5} fill="url(#leadBusiness)"/><Area type="monotone" dataKey="b2c" name="B2C" stroke="#838383" strokeWidth={1.5} fill="url(#leadConsumer)"/></AreaChart></ResponsiveContainer></div> : <div className="dashboard-chart-empty"><Database size={24}/><strong>{ar?"لا يوجد نشاط في هذه الفترة":"No activity in this period"}</strong><p>{ar?"ستظهر بياناتك هنا بعد توليد العملاء.":"Your own activity appears here after leads are generated."}</p><Button variant="outline" onClick={onNewChat}>{ar?"ابدأ بمحادثة":"Start a conversation"}<ArrowRight size={14}/></Button></div>}</CardContent></Card>
    <section className="dashboard-recent"><header><div><h2>{ar?"آخر العملاء":"Recent leads"}</h2><Badge variant="secondary">{leads.length}</Badge></div><Button variant="outline" onClick={()=>onNavigate("leads")}>{ar?"عرض كل العملاء":"View all leads"}<ArrowUpRight size={15}/></Button></header><Card><Table><TableHeader><TableRow>{(ar?["العميل","الشركة","النوع","الموقع","البحث"]:["Lead","Company","Type","Location","Research"]).map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{recent.map(lead=><TableRow key={lead.id}><TableCell><strong dir="auto">{lead.name||"—"}</strong><small dir="auto">{lead.title}</small></TableCell><TableCell dir="auto">{lead.company||"—"}</TableCell><TableCell><Badge variant="outline">{/b2c/i.test(lead.source)?"B2C":"B2B"}</Badge></TableCell><TableCell dir="auto">{lead.location||"—"}</TableCell><TableCell>{research.some(report=>report.leadId===lead.id&&report.status==="completed")?<Button size="sm" variant="ghost" onClick={()=>onNavigate("researched")}><Sparkles size={13}/>{ar?"عرض":"View"}</Button>:"—"}</TableCell></TableRow>)}{!recent.length&&<TableRow><TableCell colSpan={5} className="dashboard-empty-row">{ar?"لا يوجد عملاء بعد. ابدأ بحثك الأول من المحادثة.":"No leads yet. Start your first search in Chat."}</TableCell></TableRow>}</TableBody></Table></Card></section>
  </div>;
}
