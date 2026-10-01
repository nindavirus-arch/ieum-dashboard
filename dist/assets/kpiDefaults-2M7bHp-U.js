import{g as D}from"./index-Di5PGGbE.js";import{t as y,g as l}from"./DataUpdatedAt-DVBWgHM9.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=D("CalendarDays",[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}],["path",{d:"M8 14h.01",key:"6423bh"}],["path",{d:"M12 14h.01",key:"1etili"}],["path",{d:"M16 14h.01",key:"1gbofw"}],["path",{d:"M8 18h.01",key:"lrp35t"}],["path",{d:"M12 18h.01",key:"mhygvu"}],["path",{d:"M16 18h.01",key:"kzsmim"}]]);/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=D("DollarSign",[["line",{x1:"12",x2:"12",y1:"2",y2:"22",key:"7eqyqh"}],["path",{d:"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",key:"1b0p4s"}]]);function i(h,a){const s=y(h.start),n=y(h.end);let e=+s>+n;const c=e?+s:+n,t=e?n:s;t.setHours(0,0,0,0);let d=1;const r=[];for(;+t<=c;)r.push(y(t)),t.setDate(t.getDate()+d),t.setHours(0,0,0,0);return e?r.reverse():r}function m(h,a){var d,r,o,k;const s=l(),n=(a==null?void 0:a.weekStartsOn)??((r=(d=a==null?void 0:a.locale)==null?void 0:d.options)==null?void 0:r.weekStartsOn)??s.weekStartsOn??((k=(o=s.locale)==null?void 0:o.options)==null?void 0:k.weekStartsOn)??0,e=y(h),c=e.getDay(),t=(c<n?-7:0)+6-(c-n);return e.setDate(e.getDate()+t),e.setHours(23,59,59,999),e}const M=30,O=40;export{f as C,M as D,O as a,g as b,m as c,i as e};
