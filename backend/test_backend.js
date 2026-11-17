const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

class Range {
  constructor(sheet, row, col, nr=1, nc=1) { this.sheet=sheet; this.row=row; this.col=col; this.nr=nr; this.nc=nc; }
  getValues() {
    const out=[];
    for(let r=0;r<this.nr;r++){
      const row=[];
      for(let c=0;c<this.nc;c++) row.push(this.sheet.cells[this.row-1+r]?.[this.col-1+c] ?? '');
      out.push(row);
    }
    return out;
  }
  setValues(values) {
    for(let r=0;r<values.length;r++) for(let c=0;c<values[r].length;c++) this.setCell(this.row-1+r,this.col-1+c,values[r][c]);
    return this;
  }
  setValue(value) { this.setCell(this.row-1,this.col-1,value); return this; }
  setCell(r,c,value) { while(this.sheet.cells.length<=r)this.sheet.cells.push([]); while(this.sheet.cells[r].length<=c)this.sheet.cells[r].push(''); this.sheet.cells[r][c]=value; }
  setFontWeight(){return this;}
  setNumberFormat(){return this;}
}
class Sheet {
  constructor(name){this.name=name;this.cells=[];}
  getLastRow(){for(let i=this.cells.length-1;i>=0;i--)if(this.cells[i].some(v=>v!==''&&v!==null&&v!==undefined))return i+1;return 0;}
  getLastColumn(){let n=0;for(const row of this.cells)n=Math.max(n,row.reduce((m,v,i)=>(v!==''&&v!==null&&v!==undefined?Math.max(m,i+1):m),0));return n;}
  getMaxRows(){return 1000;}
  getRange(r,c,nr=1,nc=1){return new Range(this,r,c,nr,nc);}
  getDataRange(){return new Range(this,1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()));}
  setFrozenRows(){}
  appendRow(row){this.cells.push([...row]);}
  deleteRow(row){this.cells.splice(row-1,1);}
}
class Spreadsheet {
  constructor(){this.sheets=[];}
  getSheetByName(name){return this.sheets.find(s=>s.name===name)||null;}
  insertSheet(name){const s=new Sheet(name);this.sheets.push(s);return s;}
  getSheets(){return this.sheets;}
  deleteSheet(sheet){this.sheets=this.sheets.filter(s=>s!==sheet);}
}
const ss=new Spreadsheet();
const cache=new Map();
const mails=[];
let mailQuota=1000;
let lockCalls=0;const sleeps=[];
const lock={waitLock(){lockCalls++},releaseLock(){}};
function formatDate(date,tz,pattern){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const x={};p.forEach(v=>x[v.type]=v.value);
  if(pattern==='yyMMdd')return x.year.slice(-2)+x.month+x.day;
  if(pattern==='yyyy-MM-dd')return `${x.year}-${x.month}-${x.day}`;
  if(pattern==='yyyy-MM-dd HH:mm:ss')return `${x.year}-${x.month}-${x.day} ${x.hour}:${x.minute}:${x.second}`;
  throw new Error('Unexpected date pattern '+pattern);
}
const context={
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
  LockService:{getScriptLock:()=>lock},
  CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value,ttl)=>cache.set(key,value),remove:key=>cache.delete(key)})},
  Utilities:{
    sleep:ms=>{sleeps.push(ms)},
    formatDate,
    getUuid:()=>crypto.randomUUID(),
    computeDigest:(algo,value,charset)=>Array.from(crypto.createHash('sha256').update(String(value),'utf8').digest()).map(b=>b>127?b-256:b),
    DigestAlgorithm:{SHA_256:'SHA-256'},Charset:{UTF_8:'UTF-8'}
  },
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  MailApp:{getRemainingDailyQuota:()=>mailQuota,sendEmail:options=>{if(mailQuota<1)throw new Error('Quota exceeded');mailQuota--;mails.push(options)}},
  ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>({timeBased(){return this},everyDays(){return this},atHour(){return this},nearMinute(){return this},inTimezone(){return this},create(){return this}}),deleteTrigger(){}},
  console,
  Date, Math, JSON, Object, Array, String, Number, RegExp, Intl, Error, isFinite, parseInt, parseFloat
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'Code.gs'),'utf8'),context,{filename:'Code.gs'});
function call(name,...args){return context[name](...args)}
function response(output){return JSON.parse(output.text)}
function post(body){return response(call('doPost',{postData:{contents:JSON.stringify(body)}}))}
function setting(key){return call('getSettings')[key]}
function sheetRows(name){return call('readRows',name)}

const results=[];
function test(name,fn){try{fn();results.push({name,status:'PASS'})}catch(error){results.push({name,status:'FAIL',error:error.stack||String(error)});}}

// 1. Setup and schema upgrade. Start with an older Orders tab exactly as an existing client would.
const legacyOrders=ss.insertSheet('Orders');
legacyOrders.appendRow(['order_id','created_at','customer_name','customer_email','customer_phone','customer_address','items_json','total','status','paid_at','payment_email_sent']);
legacyOrders.appendRow(['ORD-OLD-0001','2026-01-01 12:00:00','Legacy Customer','legacy@example.com','08000000000','Old address','[]',0,'Pending','','no']);
test('setup creates four tabs and appends new columns without moving legacy order data',()=>{
  const result=call('setupSheets');assert.equal(result.ok,true);assert.deepEqual(ss.getSheets().map(s=>s.name).sort(),['Customers','Orders','Products','Settings']);
  const headers=call('headersFor_','Orders');assert(headers.includes('request_id'));assert(headers.includes('payment_plan_json'));assert(headers.includes('payment_email_started_at'));
  call('setSetting','store_name','Do Not Overwrite');call('setupSheets');assert.equal(setting('store_name'),'Do Not Overwrite');
  assert.equal(sheetRows('Orders')[0].order_id,'ORD-OLD-0001');assert.equal(sheetRows('Orders')[0].customer_email,'legacy@example.com');
  const productHeaders=call('headersFor_','Products');assert(productHeaders.includes('create_request_id'));assert(productHeaders.includes('create_fingerprint'));
});
// 2. Token configuration, login and session revocation.
const token='this-is-a-random-owner-token-with-more-than-24-chars';
test('login issues valid session and token change revokes old session',()=>{
  call('setSetting','admin_token_hash',call('sha256',token));
  const signed=post({action:'login',token});assert(signed.ok&&signed.session);
  assert.doesNotThrow(()=>call('requireAuth',signed.session));
  call('setSetting','admin_token_hash',call('sha256',token+'-changed'));
  assert.throws(()=>call('requireAuth',signed.session),/Please log in again/);
});
call('setSetting','admin_token_hash',call('sha256',token));
let session=post({action:'login',token}).session;
test('five bad token attempts throttle further guesses but do not lock out the rightful owner',()=>{
  for(let i=0;i<5;i++)assert.equal(post({action:'login',token:'wrong-token-'+i}).ok,false);
  const blocked=post({action:'login',token:'another-wrong-token'});assert.equal(blocked.ok,false);assert.match(blocked.error,/Too many wrong attempts/);
  const owner=post({action:'login',token});assert(owner.ok&&owner.session);session=owner.session;
});
// 3. Public settings must not leak secrets.
test('public GET allow-list hides owner email and token hash',()=>{
  call('setSetting','owner_email','owner@example.com');
  const data=response(call('doGet',{parameter:{action:'products'}}));
  assert(data.ok);assert(!Object.prototype.hasOwnProperty.call(data.settings,'owner_email'));assert(!Object.prototype.hasOwnProperty.call(data.settings,'admin_token_hash'));
});
// 4. Product validation and status calculation.
let productId='';
test('valid product saves with derived Few Left status',()=>{
  const result=post({action:'saveProduct',session,product:{request_id:'product-create-valid-0001',name:'Test Bag',price:12000,stock:5,category:'Bags',description:'A bag',images:[],status_locked:false}});
  assert(result.ok);productId=result.id;const p=sheetRows('Products')[0];assert.equal(p.status,'Few Left');assert.equal(Number(p.stock),5);
});
test('product price decimals, negative stock and unsafe image links are rejected',()=>{
  assert.throws(()=>call('saveProduct',{product:{name:'Bad',price:12.5,stock:2,images:[]}}),/whole number/);
  assert.throws(()=>call('saveProduct',{product:{name:'Bad',price:12,stock:-1,images:[]}}),/whole number/);
  assert.throws(()=>call('saveProduct',{product:{name:'Bad',price:12,stock:2,images:['javascript:alert(1)']}}),/HTTPS/);
});
test('creating a product is idempotent when the browser retries after a lost response',()=>{
  const input={request_id:'product-create-idempotent-01',name:'Retry Product',price:2500,stock:7,category:'Test',description:'Same data',images:[],status_locked:false};
  const first=post({action:'saveProduct',session,product:input});const count=sheetRows('Products').length;
  const second=post({action:'saveProduct',session,product:input});
  assert(first.ok&&second.ok&&second.repeatedRequest);assert.equal(first.id,second.id);assert.equal(sheetRows('Products').length,count);
  const changed=post({action:'saveProduct',session,product:{...input,price:3000}});assert.equal(changed.ok,false);assert.match(changed.error,/different details/);
});
test('manual status cannot claim In Stock when the stock count is zero',()=>{
  assert.throws(()=>call('saveProduct',{product:{request_id:'product-create-zero-0001',name:'Zero Item',price:100,stock:0,images:[],status_locked:true,status:'In Stock'}}),/zero stock must be marked Out of Stock/);
});

test('checkout rejects punctuation-only phone numbers',()=>{
  const result=post({action:'placeOrder',session,request_id:'request-phone-invalid-0001',name:'Phone Test',email:'phone@example.com',phone:'-------',address:'Edo',items:[{id:productId,qty:1}]});
  assert.equal(result.ok,false);assert.match(result.error,/valid phone number/);
});
test('manual product status stays locked when stock changes',()=>{
  const saved=call('saveProduct',{product:{request_id:'product-manual-lock-0001',name:'Manual Status Item',price:500,stock:40,images:[],status_locked:true,status:'Few Left'}});
  const item=sheetRows('Products').find(p=>p.id===saved.id);assert.equal(item.status,'Few Left');assert.equal(item.status_locked,'yes');
});
// 5. Duplicate line-item bypass must be blocked server-side.
test('duplicate product lines are aggregated before stock validation',()=>{
  const before=sheetRows('Orders').length;
  const result=post({action:'placeOrder',session,request_id:'request-duplicate-line-001',name:'Ada Buyer',email:'ada@example.com',phone:'08012345678',address:'Benin City',items:[{id:productId,qty:3},{id:productId,qty:3}]});
  assert.equal(result.ok,false);assert.match(result.error,/only 5/i);assert.equal(sheetRows('Orders').length,before);
});
// 6. Checkout calculates price on server and remains idempotent.
let orderId='';
test('placeOrder stores pending order, CRM opt-in and sends two notifications',()=>{
  const body={action:'placeOrder',session,request_id:'request-valid-order-0001',name:'Ada Buyer',email:'ada@example.com',phone:'08012345678',address:'Benin City',newsletter:true,items:[{id:productId,qty:2}],price:1,total:1};
  const result=post(body);assert(result.ok);orderId=result.orderId;assert.equal(result.total,24000);
  const order=sheetRows('Orders').find(o=>o.order_id===orderId);assert.equal(order.status,'Pending');assert.equal(order.order_customer_email_sent,'yes');assert.equal(order.order_owner_email_sent,'yes');
  const customer=sheetRows('Customers').find(c=>c.email==='ada@example.com');assert.equal(customer.newsletter_opt_in,'yes');assert.equal(Number(customer.total_orders),1);assert.equal(Number(customer.total_spent),0);
  assert(mails.some(m=>m.to==='ada@example.com'));assert(mails.some(m=>m.to==='owner@example.com'));
});
test('same request ID returns existing order without duplicate CRM count or emails',()=>{
  const beforeMails=mails.length;
  const result=post({action:'placeOrder',session,request_id:'request-valid-order-0001',name:'Ada Buyer',email:'ada@example.com',phone:'08012345678',address:'Benin City',newsletter:true,items:[{id:productId,qty:2}]});
  assert(result.ok&&result.repeatedRequest);assert.equal(result.orderId,orderId);assert.equal(sheetRows('Orders').filter(o=>o.request_id==='request-valid-order-0001').length,1);
  assert.equal(Number(sheetRows('Customers')[0].total_orders),1);assert.equal(mails.length,beforeMails);
  assert.equal(sheetRows('Customers').find(c=>c.email==='ada@example.com').newsletter_opt_in,'yes');
  const changed=post({action:'placeOrder',session,request_id:'request-valid-order-0001',name:'Ada Buyer',email:'ada@example.com',phone:'08012345678',address:'A different address',newsletter:false,items:[{id:productId,qty:2}]});
  assert.equal(changed.ok,false);assert.match(changed.error,/different details/);
});
test('order is saved when email quota is exhausted, and the owner can retry both notifications safely',()=>{
  const newP=call('saveProduct',{product:{request_id:'product-create-order-mail-001',name:'Mail Retry Item',price:700,stock:4,images:[]}}).id;
  const input={action:'placeOrder',session,request_id:'request-email-retry-000001',name:'Mail Retry Buyer',email:'mailretry@example.com',phone:'08077778888',address:'Edo',items:[{id:newP,qty:1}]};
  const before=mails.length;mailQuota=0;const first=post(input);assert(first.ok);assert.equal(sheetRows('Orders').find(o=>o.order_id===first.orderId).status,'Pending');
  assert.equal(sheetRows('Orders').find(o=>o.order_id===first.orderId).order_customer_email_sent,'no');assert.equal(mails.length,before);
  mailQuota=100;const retry=post({action:'retryOrderEmails',session,orderId:first.orderId});assert(retry.ok&&retry.customerEmailSent&&retry.ownerEmailSent);
  const order=sheetRows('Orders').find(o=>o.order_id===first.orderId);assert.equal(order.order_customer_email_sent,'yes');assert.equal(order.order_owner_email_sent,'yes');assert.equal(mails.length,before+2);
  const count=mails.length;const again=post({action:'retryOrderEmails',session,orderId:first.orderId});assert(again.ok&&again.customerEmailSent&&again.ownerEmailSent);assert.equal(mails.length,count);
  const sameCheckout=post(input);assert(sameCheckout.ok&&sameCheckout.repeatedRequest);assert.equal(mails.length,count);
});

// 7. Payment deduction and duplicate confirmation.
test('markPaid deducts exact stock once and recomputes CRM spend',()=>{
  const result=post({action:'markPaid',session,orderId});assert.equal(result.ok,true);assert.equal(result.receiptSent,true);
  const p=sheetRows('Products').find(x=>x.id===productId);assert.equal(Number(p.stock),3);assert.equal(p.status,'Few Left');
  const c=sheetRows('Customers').find(x=>x.email==='ada@example.com');assert.equal(Number(c.total_spent),24000);
  assert.equal(sheetRows('Orders').find(x=>x.order_id===orderId).payment_email_sent,'yes');
  const mailCount=mails.length;const again=post({action:'markPaid',session,orderId});assert(again.ok);assert.equal(mails.length,mailCount);assert.equal(Number(sheetRows('Products').find(x=>x.id===productId).stock),3);
});
test('manual status lock cannot keep a zero-stock product looking available',()=>{
  const item=call('saveProduct',{product:{request_id:'product-zero-lock-check-01',name:'Last Unit Item',price:1000,stock:1,images:[],status_locked:true,status:'Few Left'}}).id;
  const placed=post({action:'placeOrder',session,request_id:'request-zero-lock-check-01',name:'Zero Stock Buyer',email:'zerostock@example.com',phone:'08012345555',address:'Benin City',items:[{id:item,qty:1}]});
  assert(placed.ok);const paid=post({action:'markPaid',session,orderId:placed.orderId});assert(paid.ok);
  const saved=sheetRows('Products').find(row=>row.id===item);assert.equal(Number(saved.stock),0);assert.equal(saved.status,'Out of Stock');assert.equal(saved.status_locked,'yes');
  const publicItem=response(call('doGet',{parameter:{action:'products'}})).products.find(row=>row.id===item);assert.equal(publicItem.status,'Out of Stock');
});
// 8. Multiple pending orders compete for last available units.
let orderA='',orderB='';
test('oversubscribed pending orders trigger low-stock warning then explicit force',()=>{
  const common={action:'placeOrder',session,name:'Bea Buyer',email:'bea@example.com',phone:'08022223333',address:'Edo',items:[{id:productId,qty:2}]};
  orderA=post({...common,request_id:'request-order-a-000001'}).orderId;
  orderB=post({...common,request_id:'request-order-b-000001'}).orderId;
  let paid=post({action:'markPaid',session,orderId:orderA});assert(paid.ok); // stock falls from 3 to 1
  let shortage=post({action:'markPaid',session,orderId:orderB});assert.equal(shortage.ok,false);assert.equal(shortage.error,'low_stock');assert.equal(shortage.shortages[0].have,1);
  const forced=post({action:'markPaid',session,orderId:orderB,force:true});assert(forced.ok);assert.equal(Number(sheetRows('Products').find(x=>x.id===productId).stock),0);
  assert.equal(sheetRows('Orders').find(x=>x.order_id===orderB).status,'Paid');
});
// 9. Cancellation and delete protection.
let pendingId='';
test('pending order cancellation is allowed, and paid order cancellation is refused',()=>{
  const cancelProduct=call('saveProduct',{product:{request_id:'product-create-cancel-0001',name:'Cancel Test Item',price:100,stock:5,images:[]}}).id;
  const result=post({action:'placeOrder',session,request_id:'request-cancel-000001',name:'Cal Buyer',email:'cal@example.com',phone:'08033334444',address:'Edo',items:[{id:cancelProduct,qty:1}]});pendingId=result.orderId;
  assert(post({action:'cancelOrder',session,orderId:pendingId}).ok);
  const paidError=post({action:'cancelOrder',session,orderId}).error;assert.match(paidError,/Only pending/);
});
test('product deletion is blocked while a pending order still references it',()=>{
  const deleteProductId=call('saveProduct',{product:{request_id:'product-create-delete-0001',name:'Delete Guard Item',price:100,stock:5,images:[]}}).id;
  const result=post({action:'placeOrder',session,request_id:'request-delete-guard-0001',name:'Dee Buyer',email:'dee@example.com',phone:'08044445555',address:'Edo',items:[{id:deleteProductId,qty:1}]});
  assert.throws(()=>call('deleteProduct',{id:deleteProductId}),/pending order/);
  call('cancelOrder',{orderId:result.orderId});
  assert(call('deleteProduct',{id:deleteProductId}).ok);
});
test('paid order snapshots remain readable after its product is deleted',()=>{
  const product=call('saveProduct',{product:{request_id:'product-create-snapshot-001',name:'Snapshot Item',price:900,stock:2,images:[]}}).id;
  const placed=call('placeOrder',{request_id:'request-snapshot-000001',name:'Snap Buyer',email:'snap@example.com',phone:'08088889999',address:'Edo',items:[{id:product,qty:1}]});
  call('markPaid',{orderId:placed.orderId});call('deleteProduct',{id:product});
  const order=call('getOrders').orders.find(o=>o.order_id===placed.orderId);assert.equal(order.items[0].name,'Snapshot Item');assert.equal(order.items[0].price,900);
});
// 10. Payment recovery is idempotent after a partial write.
test('prepared payment recovery reapplies absolute stock targets and does not double count',()=>{
  const newP=call('saveProduct',{product:{request_id:'product-create-recov-0001',name:'Recovery Item',price:1000,stock:8,images:[],category:'Test'}}).id;
  const placed=call('placeOrder',{request_id:'request-recovery-000001',name:'Eve Buyer',email:'eve@example.com',phone:'08055556666',address:'Edo',items:[{id:newP,qty:3}]});
  const order=sheetRows('Orders').find(x=>x.order_id===placed.orderId);
  call('updateRow','Orders',order._row,{payment_state:'PREPARED',payment_plan_json:JSON.stringify([{id:newP,qty:3,stock_after:5}])});
  call('updateRow','Products',sheetRows('Products').find(x=>x.id===newP)._row,{stock:5}); // simulate crash after stock update
  call('recoverPreparedPayments_');call('recoverPreparedPayments_');
  const saved=sheetRows('Orders').find(x=>x.order_id===placed.orderId);assert.equal(saved.status,'Paid');assert.equal(saved.payment_state,'COMPLETE');
  assert.equal(Number(sheetRows('Products').find(x=>x.id===newP).stock),5);assert.equal(Number(sheetRows('Customers').find(x=>x.email==='eve@example.com').total_spent),3000);
});
// 11. Email failure should never undo payment and must be retryable.
test('receipt email failure is reported and can be retried without stock changes',()=>{
  const newP=call('saveProduct',{product:{request_id:'product-create-email-0001',name:'Email Item',price:500,stock:2,images:[]}}).id;
  const placed=call('placeOrder',{request_id:'request-email-failure-0001',name:'Fran Buyer',email:'fran@example.com',phone:'08066667777',address:'Edo',items:[{id:newP,qty:1}]});
  mailQuota=0;const failed=post({action:'markPaid',session,orderId:placed.orderId});assert.equal(failed.ok,true);assert.equal(failed.receiptSent,false);
  assert.equal(sheetRows('Orders').find(x=>x.order_id===placed.orderId).status,'Paid');assert.equal(Number(sheetRows('Products').find(x=>x.id===newP).stock),1);
  mailQuota=100;const retried=post({action:'retryReceipt',session,orderId:placed.orderId});assert.equal(retried.receiptSent,true);
  assert.equal(sheetRows('Orders').find(x=>x.order_id===placed.orderId).payment_email_sent,'yes');
  assert.equal(Number(sheetRows('Products').find(x=>x.id===newP).stock),1);
});
// 12. Settings allow-list and format validation.
test('settings reject protected keys and invalid configuration',()=>{
  assert.throws(()=>call('saveSettings',{settings:{admin_token_hash:'hacked'}}),/cannot be changed/);
  assert(call('saveSettings',{settings:{whatsapp_number:'08012345678'}}).ok);assert.equal(setting('whatsapp_number'),'2348012345678');
  assert.throws(()=>call('saveSettings',{settings:{whatsapp_number:'0801234'}}),/country code/);
  assert.throws(()=>call('saveSettings',{settings:{brand_color:'red'}}),/hex colour/);
  assert(call('saveSettings',{settings:{low_stock_threshold:'0',brand_color:'#123456',whatsapp_number:'+234 801 234 5678'}}).ok);
  assert.equal(setting('whatsapp_number'),'2348012345678');assert.equal(call('getThreshold_'),0);
});
test('formula-like customer and product text is escaped before entering Google Sheets',()=>{
  const created=call('saveProduct',{product:{request_id:'product-formula-guard-0001',name:'=IMPORTXML(\"https://example.invalid\",\"//x\")',price:100,stock:12,description:'  +SUM(A1:A2)',images:[]}});
  const rawRow=(sheetName,idHeader,id)=>{const cells=ss.getSheetByName(sheetName).cells;const h=cells[0];const i=h.indexOf(idHeader);const r=cells.find((row,n)=>n>0&&row[i]===id);return Object.fromEntries(h.map((k,n)=>[k,r[n]]))};
  const savedProduct=rawRow('Products','id',created.id);
  assert(savedProduct.name.startsWith("'="));assert(savedProduct.description.startsWith("'+"));
  assert.equal(sheetRows('Products').find(row=>row.id===created.id).name.startsWith('='),true); // reads round-trip
  const order=post({action:'placeOrder',session,request_id:'request-formula-guard-0001',name:'=IMPORTXML(\"https://example.invalid\",\"//x\")',email:'formula@example.com',phone:'08011112222',address:'  +SUM(A1:A2)',items:[{id:created.id,qty:1}]});
  assert(order.ok);const savedOrder=rawRow('Orders','order_id',order.orderId);
  assert(savedOrder.customer_name.startsWith("'="));assert(savedOrder.customer_address.startsWith("'+"));
});
test('dashboard, orders, products and customers endpoints return consistent CRM data',()=>{
  const dashboard=post({action:'getDashboard',session});assert(dashboard.ok);assert(Number.isFinite(dashboard.salesToday));
  const orders=post({action:'getOrders',session});assert(orders.ok&&Array.isArray(orders.orders));
  const products=post({action:'getProducts',session});assert(products.ok&&products.products.some(p=>p.id===productId));
  const customers=post({action:'getCustomers',session});assert(customers.ok&&customers.customers.some(c=>c.email==='ada@example.com'));
  const settings=post({action:'adminGetSettings',session});assert(settings.ok);assert(!Object.prototype.hasOwnProperty.call(settings.settings,'admin_token_hash'));
  const saved=post({action:'updateCustomer',session,email:'ada@example.com',notes:'Call before delivery',tags:'VIP'});assert(saved.ok);
  const refreshed=post({action:'getCustomers',session}).customers.find(c=>c.email==='ada@example.com');assert.equal(refreshed.notes,'Call before delivery');assert.equal(refreshed.tags,'VIP');
});
// 13. Daily summary contains stock status data and sends even with no orders.
test('daily summary sends owner email and includes stock table',()=>{
  const before=mails.length;const result=call('dailySummary');assert.equal(result,true);assert.equal(mails.length,before+1);assert(mails[mails.length-1].htmlBody.includes('Stock status'));
});
// 14. Authenticated API rejects prototype route names.
test('API rejects inherited object properties as route names',()=>{
  const result=post({action:'toString',session});assert.equal(result.ok,false);assert.match(result.error,/Unknown action/);
});


// ================= v3 additions =================
const rawRowV3=(sheetName,idHeader,id)=>{const cells=ss.getSheetByName(sheetName).cells;const h=cells[0];const i=h.indexOf(idHeader);const r=cells.find((row,n)=>n>0&&row[i]===id);return Object.fromEntries(h.map((k,n)=>[k,r[n]]))};
const mkProduct=(name,price,stock,extra={})=>call('saveProduct',{product:Object.assign({request_id:'v3-'+Math.random().toString(36).slice(2)+'-'+Date.now(),name,price,stock,images:[],category:'V3'},extra)}).id;
const mkOrder=(productId,qty,tag)=>post({action:'placeOrder',session,request_id:'v3-order-'+tag+'-'+Date.now()+Math.random().toString(36).slice(2),name:'V3 Buyer',email:'v3-'+tag+'@example.com',phone:'08030000000',address:'Edo',items:[{id:productId,qty}]});

test('v3: wrong token is slowed outside any lock, and the right token still works',()=>{
  const locksBefore=lockCalls,sleepsBefore=sleeps.length;
  assert.equal(post({action:'login',token:'definitely-wrong-token'}).ok,false);
  assert.equal(sleeps.length,sleepsBefore+1);assert(sleeps[sleeps.length-1]>=1000&&sleeps[sleeps.length-1]<=3000);
  assert.equal(lockCalls,locksBefore,'login must not take the script lock');
  assert(post({action:'login',token}).ok);
});
test('v3: stale edit form cannot overwrite live stock',()=>{
  const id=mkProduct('Stale Guard',500,10);const row=sheetRows('Products').find(x=>x.id===id);
  call('updateRow','Products',row._row,{stock:7}); // a sale moved stock while the form was open
  const kept=call('saveProduct',{product:{id,stock_loaded:10,name:'Stale Guard',price:500,stock:10,images:[],category:'V3'}});assert(kept.ok);
  assert.equal(Number(sheetRows('Products').find(x=>x.id===id).stock),7);
  assert.throws(()=>call('saveProduct',{product:{id,stock_loaded:10,name:'Stale Guard',price:500,stock:20,images:[],category:'V3'}}),/Stock changed while you were editing/);
});
test('v3: price must be at least 1 and original price must be higher than price',()=>{
  assert.throws(()=>mkProduct('Free',0,3),/whole number from 1/);
  assert.throws(()=>mkProduct('Bad Sale',1000,3,{compare_at_price:900}),/Original price must be higher/);
  const id=mkProduct('Sale Item',1000,3,{compare_at_price:1500,featured:true});
  const pub=response(call('doGet',{parameter:{action:'products'}})).products.find(x=>x.id===id);
  assert.equal(pub.compare_at_price,1500);assert.strictEqual(pub.featured,true);
});
test('v3: created_at is set once by the backend and survives edits',()=>{
  const id=mkProduct('Dated Item',300,4);const first=rawRowV3('Products','id',id);
  assert(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(first.created_at));assert.equal(first.updated_at,first.created_at);
  call('saveProduct',{product:{id,name:'Dated Item 2',price:300,stock:4,images:[],category:'V3',created_at:'1999-01-01 00:00:00'}});
  const after=rawRowV3('Products','id',id);assert.equal(after.created_at,first.created_at);assert.equal(after.name,'Dated Item 2');
  const pub=response(call('doGet',{parameter:{action:'products'}})).products.find(x=>x.id===id);assert.equal(pub.created_at,first.created_at);
});
test('v3: backfillProductDates stamps only products that have no date',()=>{
  const id=mkProduct('Legacy Row',300,4);const row=sheetRows('Products').find(x=>x.id===id);
  call('updateRow','Products',row._row,{created_at:'',updated_at:''});
  const result=call('backfillProductDates');assert(result.ok&&result.stamped>=1);
  assert(rawRowV3('Products','id',id).created_at.length>0);assert.equal(call('backfillProductDates').stamped,0);
});
test('v3: a +234 phone is stored untouched and an identical retry returns the same order',()=>{
  const id=mkProduct('Phone Retry',200,9);const body={action:'placeOrder',session,request_id:'v3-phone-retry-000001',name:'=Fancy Name',email:'plus@example.com',phone:'+234 801 234 5678',address:'Lagos',items:[{id,qty:1}]};
  const first=post(body);assert(first.ok);const raw=rawRowV3('Orders','order_id',first.orderId);
  assert.equal(raw.customer_phone,'+234 801 234 5678');assert(raw.customer_name.startsWith("'="));
  const again=post(body);assert(again.ok&&again.repeatedRequest,again.error);assert.equal(again.orderId,first.orderId);
});
test('v3: WhatsApp numbers saved in local format are normalised on save, on read and on migration',()=>{
  call('setSetting','whatsapp_number','08011112222');
  assert.equal(response(call('doGet',{parameter:{action:'products'}})).settings.whatsapp_number,'2348011112222');
  call('setSetting','whatsapp_number','08011112222');call('setupSheets');assert.equal(setting('whatsapp_number'),'2348011112222');
  assert.throws(()=>call('saveSettings',{settings:{whatsapp_number:'0801234'}}),/country code/);
});
test('v3: undo payment restores stock once, resets the order and survives an interruption',()=>{
  const id=mkProduct('Undo Item',800,5);const placed=mkOrder(id,2,'undo');assert(placed.ok);
  assert(post({action:'markPaid',session,orderId:placed.orderId}).ok);assert.equal(Number(sheetRows('Products').find(x=>x.id===id).stock),3);
  assert(post({action:'revertPaid',session,orderId:placed.orderId}).ok);
  const o=sheetRows('Orders').find(x=>x.order_id===placed.orderId);
  assert.equal(o.status,'Pending');assert.equal(o.paid_at,'');assert.equal(o.payment_state,'');assert.equal(o.payment_email_sent,'no');
  assert.equal(Number(sheetRows('Products').find(x=>x.id===id).stock),5);
  assert.equal(Number(sheetRows('Customers').find(c=>c.email==='v3-undo@example.com').total_spent),0);
  assert.equal(post({action:'revertPaid',session,orderId:placed.orderId}).ok,false);
  assert(post({action:'markPaid',session,orderId:placed.orderId}).ok);assert.equal(Number(sheetRows('Products').find(x=>x.id===id).stock),3);
  // interrupted undo: journal written, stock applied, crash before the order was reset
  const paid=sheetRows('Orders').find(x=>x.order_id===placed.orderId);
  call('updateRow','Orders',paid._row,{payment_state:'REVERTING',payment_plan_json:JSON.stringify([{id,restore:2,stock_after:5}])});
  call('recoverPreparedPayments_');call('recoverPreparedPayments_');
  assert.equal(Number(sheetRows('Products').find(x=>x.id===id).stock),5);assert.equal(sheetRows('Orders').find(x=>x.order_id===placed.orderId).status,'Pending');
});
test('v3: undo after a forced shortage restores only what was actually deducted',()=>{
  const id=mkProduct('Short Item',800,1);const placed=mkOrder(id,1,'short');
  const second=mkOrder(id,1,'short2');assert(post({action:'markPaid',session,orderId:placed.orderId}).ok);
  assert(post({action:'markPaid',session,orderId:second.orderId,force:true}).ok); // stock already 0, deducted 0
  assert.equal(Number(sheetRows('Products').find(x=>x.id===id).stock),0);
  assert(post({action:'revertPaid',session,orderId:second.orderId}).ok);
  assert.equal(Number(sheetRows('Products').find(x=>x.id===id).stock),0,'nothing was deducted, so nothing is restored');
});
test('v3: best sellers rank paid units only and expose no customer data',()=>{
  const a=mkProduct('Best A',100,50),b=mkProduct('Best B',100,50),c=mkProduct('Best C pending',100,50);
  [[a,3],[b,1]].forEach(([id,qty],i)=>{const o=mkOrder(id,qty,'bs'+i);assert(post({action:'markPaid',session,orderId:o.orderId}).ok)});
  assert(mkOrder(c,5,'bs-pending').ok);
  const bundle=response(call('doGet',{parameter:{action:'storefront'}}));
  assert(bundle.ok&&Array.isArray(bundle.bestSellers)&&Array.isArray(bundle.products)&&bundle.settings);
  const ids=bundle.bestSellers.map(x=>x.id);assert(ids.indexOf(a)>=0&&ids.indexOf(a)<ids.indexOf(b));assert.equal(ids.indexOf(c),-1);
  bundle.bestSellers.forEach(x=>assert.deepEqual(Object.keys(x).sort(),['id','rank']));
  assert(!JSON.stringify(bundle).includes('v3-bs0@example.com'));assert(!Object.prototype.hasOwnProperty.call(bundle.settings,'owner_email'));
});
test('v3: public payload is cached without a lock and cleared by product, settings and delete writes',()=>{
  const id=mkProduct('Cache Item',250,6);
  const first=response(call('doGet',{parameter:{action:'products'}}));assert(first.products.some(x=>x.id===id));
  const before=lockCalls;const second=response(call('doGet',{parameter:{action:'products'}}));assert.equal(lockCalls,before,'cache hit must not take the lock');
  call('saveProduct',{product:{id,name:'Cache Item Renamed',price:250,stock:6,images:[],category:'V3'}});
  assert.equal(response(call('doGet',{parameter:{action:'products'}})).products.find(x=>x.id===id).name,'Cache Item Renamed');
  call('saveSettings',{settings:{tagline:'Fresh tagline'}});assert.equal(response(call('doGet',{parameter:{action:'products'}})).settings.tagline,'Fresh tagline');
  call('deleteProduct',{id});assert(!response(call('doGet',{parameter:{action:'products'}})).products.some(x=>x.id===id));
});
test('v3: one damaged order row cannot break the dashboard orders list',()=>{
  const id=mkProduct('Damaged Row',100,2);const o=mkOrder(id,1,'damaged');const row=sheetRows('Orders').find(x=>x.order_id===o.orderId);
  call('updateRow','Orders',row._row,{items_json:'{not json'});
  const orders=post({action:'getOrders',session});assert(orders.ok);assert.deepEqual(orders.orders.find(x=>x.order_id===o.orderId).items,[]);
  call('cancelOrder',{orderId:o.orderId});
});
test('v3: daily summary reports the day that just ended when it runs just after midnight',()=>{
  assert.equal(call('summaryDay_'),Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(new Date(Date.now()-6*3600*1000)));
});

const summary={total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};
if(process.env.WRITE_RESULTS)fs.writeFileSync(require('path').join(__dirname,'backend-test-results.json'),JSON.stringify(summary,null,2));
results.filter(r=>r.status==='FAIL').forEach(r=>console.error('FAIL: '+r.name+'\n'+r.error));
console.log('Backend simulation tests: '+summary.passed+'/'+summary.total+' passed, '+summary.failed+' failed');
if(summary.failed)process.exit(1);
