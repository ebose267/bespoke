/* ===== PREVIEW BACKEND (demo only) =====
   Injected by scripts/build-preview.mjs in place of the real api() function.
   Everything lives in this tab's memory; nothing is sent anywhere and a refresh resets it. */
function previewDate(date){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const v={};parts.forEach(p=>v[p.type]=p.value);return v.year+'-'+v.month+'-'+v.day+' '+v.hour+':'+v.minute+':'+v.second;
}
const agoHours=h=>previewDate(new Date(Date.now()-h*3600000));
let M={
  settings:{store_name:'Demo Store',owner_email:'owner@example.com',whatsapp_number:'2348012345678',currency_symbol:'₦',brand_color:'#0b6e4f',logo_url:'',banner_text:'Welcome!',categories:'Shoes,Bags,Accessories',low_stock_threshold:'5',dashboard_url:'',tagline:'Useful things, thoughtfully selected.',about_title:'About Demo Store',about_text:'This is sample store content for preview only.',contact_phone:'08012345678',contact_email:'hello@example.com',contact_address:'Benin City, Edo State',opening_hours:'Mon–Sat, 9am–6pm',instagram_url:''},
  products:[
    {id:'P-DEMO-1',name:'Red Sneakers',price:15000,description:'Comfortable everyday sneakers.',category:'Shoes',images:[],stock:12,status:'In Stock',status_locked:'no',featured:'yes',compare_at_price:18000,created_at:agoHours(72),updated_at:agoHours(72)},
    {id:'P-DEMO-2',name:'Leather Tote Bag',price:28000,description:'Handmade leather tote.',category:'Bags',images:[],stock:4,status:'Few Left',status_locked:'no',featured:'no',compare_at_price:0,created_at:agoHours(48),updated_at:agoHours(48)},
    {id:'P-DEMO-3',name:'Canvas Belt',price:6500,description:'Durable canvas belt.',category:'Accessories',images:[],stock:0,status:'Out of Stock',status_locked:'no',featured:'no',compare_at_price:0,created_at:agoHours(24),updated_at:agoHours(24)},
    {id:'P-DEMO-4',name:'Sunglasses',price:9000,description:'UV-protected shades.',category:'Accessories',images:[],stock:20,status:'In Stock',status_locked:'no',featured:'no',compare_at_price:0,created_at:agoHours(6),updated_at:agoHours(6)}
  ],
  orders:[
    {order_id:'ORD-DEMO-1007',created_at:agoHours(2),customer_name:'Ngozi Udo',customer_phone:'08031112233',customer_email:'ngozi@example.com',customer_address:'12 Airport Rd, Benin City',items:[{id:'P-DEMO-1',name:'Red Sneakers',price:15000,qty:2}],total:30000,status:'Paid',paid_at:agoHours(1),payment_email_sent:'yes',payment_state:'COMPLETE',order_customer_email_sent:'yes',order_owner_email_sent:'yes'},
    {order_id:'ORD-DEMO-1006',created_at:agoHours(5),customer_name:'Ibrahim Musa',customer_phone:'08074445566',customer_email:'ibrahim@example.com',customer_address:'5 Uselu, Benin City',items:[{id:'P-DEMO-4',name:'Sunglasses',price:9000,qty:1}],total:9000,status:'Paid',paid_at:agoHours(4),payment_email_sent:'no',payment_state:'COMPLETE',order_customer_email_sent:'yes',order_owner_email_sent:'yes'},
    {order_id:'ORD-DEMO-1005',created_at:agoHours(25),customer_name:'Chioma Eze',customer_phone:'08025556677',customer_email:'chioma@example.com',customer_address:'8 Ring Rd, Benin City',items:[{id:'P-DEMO-2',name:'Leather Tote Bag',price:28000,qty:1},{id:'P-DEMO-3',name:'Canvas Belt',price:6500,qty:1}],total:34500,status:'Paid',paid_at:agoHours(24),payment_email_sent:'yes',payment_state:'COMPLETE',order_customer_email_sent:'yes',order_owner_email_sent:'yes'},
    {order_id:'ORD-DEMO-1004',created_at:agoHours(3),customer_name:'Amaka Obi',customer_phone:'08067778899',customer_email:'amaka@example.com',customer_address:'3 Sapele Rd, Benin City',items:[{id:'P-DEMO-2',name:'Leather Tote Bag',price:28000,qty:6}],total:168000,status:'Pending',paid_at:'',payment_email_sent:'no',payment_state:'',order_customer_email_sent:'yes',order_owner_email_sent:'yes'},
    {order_id:'ORD-DEMO-1003',created_at:agoHours(1),customer_name:'Tunde Bakare',customer_phone:'08099990000',customer_email:'tunde@example.com',customer_address:'27 Akpakpava St, Benin City',items:[{id:'P-DEMO-1',name:'Red Sneakers',price:15000,qty:1}],total:15000,status:'Pending',paid_at:'',payment_email_sent:'no',payment_state:'',order_customer_email_sent:'no',order_owner_email_sent:'no'}
  ],
  customers:[
    {email:'amaka@example.com',name:'Amaka Obi',phone:'08067778899',address:'3 Sapele Rd, Benin City',newsletter_opt_in:'yes',newsletter_date:agoHours(200),first_order_at:agoHours(300),last_order_at:agoHours(1),total_orders:1,total_spent:0,notes:'',tags:'VIP'},
    {email:'chioma@example.com',name:'Chioma Eze',phone:'08025556677',address:'8 Ring Rd, Benin City',newsletter_opt_in:'yes',newsletter_date:agoHours(500),first_order_at:agoHours(600),last_order_at:agoHours(24),total_orders:2,total_spent:34500,notes:'',tags:''},
    {email:'ngozi@example.com',name:'Ngozi Udo',phone:'08031112233',address:'12 Airport Rd, Benin City',newsletter_opt_in:'no',newsletter_date:'',first_order_at:agoHours(2),last_order_at:agoHours(2),total_orders:1,total_spent:30000,notes:'',tags:'Wholesale'},
    {email:'tunde@example.com',name:'Tunde Bakare',phone:'08099990000',address:'27 Akpakpava St, Benin City',newsletter_opt_in:'no',newsletter_date:'',first_order_at:agoHours(1),last_order_at:agoHours(1),total_orders:1,total_spent:0,notes:'',tags:''}
  ]
};
function demoOrder(id){const o=M.orders.find(x=>x.order_id===id);if(!o)throw new Error('Order not found.');return o}
function mock(action,data){
  const threshold=Number(M.settings.low_stock_threshold)||0;
  const auto=n=>n<=0?'Out of Stock':n<=threshold?'Few Left':'In Stock';
  const copy=v=>JSON.parse(JSON.stringify(v));
  switch(action){
    case 'login':return {ok:true,session:'preview'};
    case 'getDashboard':{const today=previewDate(new Date()).slice(0,10);return {ok:true,ordersToday:M.orders.filter(o=>String(o.created_at).startsWith(today)).length,salesToday:M.orders.filter(o=>String(o.paid_at).startsWith(today)).reduce((n,o)=>n+o.total,0),pendingCount:M.orders.filter(o=>o.status==='Pending').length,stockAlerts:M.products.filter(p=>p.status!=='In Stock').map(p=>({id:p.id,name:p.name,stock:p.stock,status:p.status}))}}
    case 'getOrders':return {ok:true,orders:copy([...M.orders].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))))};
    case 'getProducts':return {ok:true,products:copy(M.products)};
    case 'getCustomers':return {ok:true,customers:copy(M.customers)};
    case 'adminGetSettings':return {ok:true,settings:{...M.settings}};
    case 'markPaid':{
      const o=demoOrder(data.orderId);if(o.status!=='Pending')throw new Error('This order is already '+o.status+'.');
      const need=Object.create(null);o.items.forEach(i=>need[i.id]=(need[i.id]||0)+i.qty);
      const shortages=[];Object.keys(need).forEach(id=>{const p=M.products.find(x=>x.id===id);const have=p?p.stock:0;if(have<need[id])shortages.push({name:(o.items.find(i=>i.id===id)||{}).name,needed:need[id],have})});
      if(shortages.length&&!data.force){const e=new Error('low_stock');e.data={ok:false,error:'low_stock',shortages};throw e}
      o.deducted={};Object.keys(need).forEach(id=>{const p=M.products.find(x=>x.id===id);if(p){const d=Math.min(p.stock,need[id]);o.deducted[id]=d;p.stock-=d;if(p.status_locked!=='yes'||p.stock<=0)p.status=p.status_locked==='yes'?'Out of Stock':auto(p.stock)}});
      o.status='Paid';o.paid_at=previewDate(new Date());o.payment_state='COMPLETE';o.payment_email_sent='yes';
      const c=M.customers.find(x=>x.email===o.customer_email);if(c)c.total_spent+=o.total;return {ok:true,receiptSent:true};
    }
    case 'revertPaid':{
      const o=demoOrder(data.orderId);if(o.status!=='Paid')throw new Error('Only paid orders can be undone.');
      o.items.forEach(i=>{const p=M.products.find(x=>x.id===i.id);if(p){p.stock+=(o.deducted&&o.deducted[i.id]!==undefined)?o.deducted[i.id]:i.qty;if(p.status_locked!=='yes')p.status=auto(p.stock)}});
      o.status='Pending';o.paid_at='';o.payment_state='';o.payment_email_sent='no';
      const c=M.customers.find(x=>x.email===o.customer_email);if(c)c.total_spent=Math.max(0,c.total_spent-o.total);return {ok:true};
    }
    case 'retryReceipt':{const o=demoOrder(data.orderId);if(o.status!=='Paid')throw new Error('Only paid orders can receive a payment receipt.');o.payment_email_sent='yes';return {ok:true,receiptSent:true}}
    case 'retryOrderEmails':{const o=demoOrder(data.orderId);o.order_customer_email_sent='yes';o.order_owner_email_sent='yes';return {ok:true,customerEmailSent:true,ownerEmailSent:true}}
    case 'cancelOrder':{const o=demoOrder(data.orderId);if(o.status!=='Pending')throw new Error('Only pending orders can be cancelled.');o.status='Cancelled';return {ok:true}}
    case 'saveProduct':{
      const i=data.product;if(!String(i.name||'').trim())throw new Error('Product name is required.');
      const price=Number(i.price);let stock=Number(i.stock);
      if(!Number.isSafeInteger(price)||price<1)throw new Error('Price must be a whole number from 1 to 1000000000000.');
      if(!Number.isSafeInteger(stock)||stock<0)throw new Error('Stock must be a whole number.');
      const cmp=Number(i.compare_at_price||0);if(cmp>0&&cmp<=price)throw new Error('Original price must be higher than the selling price, or left blank.');
      const locked=i.status_locked===true;if(locked&&stock===0&&i.status!=='Out of Stock')throw new Error('A product with zero stock must be marked Out of Stock.');
      const old=i.id?M.products.find(p=>p.id===i.id):null;if(i.id&&!old)throw new Error('Product not found.');
      if(old&&i.stock_loaded!==undefined){if(stock===Number(i.stock_loaded))stock=old.stock;else if(old.stock!==Number(i.stock_loaded))throw new Error('Stock changed while you were editing (it is now '+old.stock+'). Please reopen the product and try again.')}
      const rec={name:i.name.trim(),price,stock,description:i.description||'',category:i.category||'',images:[...(i.images||[])],status:locked?i.status:auto(stock),status_locked:locked?'yes':'no',featured:i.featured?'yes':'no',compare_at_price:cmp,updated_at:previewDate(new Date())};
      if(old){Object.assign(old,rec);return {ok:true,id:old.id}}
      const prior=i.request_id&&M.products.find(p=>p.request_id===i.request_id);if(prior)return {ok:true,id:prior.id,repeatedRequest:true};
      const np=Object.assign({id:'P-DEMO-'+Date.now(),request_id:i.request_id||'',created_at:previewDate(new Date())},rec);M.products.push(np);return {ok:true,id:np.id};
    }
    case 'deleteProduct':{if(M.orders.some(o=>o.status==='Pending'&&o.items.some(i=>i.id===data.id)))throw new Error('This product is in a pending order. Cancel or complete that order before deleting the product.');M.products=M.products.filter(p=>p.id!==data.id);return {ok:true}}
    case 'updateCustomer':{const c=M.customers.find(x=>x.email===data.email);if(!c)throw new Error('Customer not found.');c.tags=String(data.tags||'').slice(0,200);c.notes=String(data.notes||'').slice(0,1000);return {ok:true}}
    case 'saveSettings':Object.assign(M.settings,data.settings||{});return {ok:true};
    default:throw new Error('Unknown preview action.');
  }
}
async function api(action,data){
  await new Promise(r=>setTimeout(r,180));
  const result=mock(action,data||{});
  if(!result.ok){const e=new Error(result.error||'Something went wrong.');e.data=result;throw e}
  return JSON.parse(JSON.stringify(result));
}
