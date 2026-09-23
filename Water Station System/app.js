const PRICE_PER_GALLON = 25; 

const state = {
  users: [],
  transactions: [],
  bills: [],
  deliveries: [],
  maintenance: [],
  inventory: [],   
  receiving: [],
  employees: [],
  suppliers: [],
  counters: { user:0, tx:0, bill:0, delivery:0, maint:0, inv:0, recv:0, emp:0, sup:0 },
  currentUser: null,
};

function nextId(prefix, key){
  state.counters[key] += 1;
  return `${prefix}-${String(state.counters[key]).padStart(3,'0')}`;
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmtMoney(n){ return '₱' + (Number(n)||0).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function fmtDate(d){ if(!d) return '—'; const dt = new Date(d); if(isNaN(dt)) return d; return dt.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}); }
function daysBetween(a,b){ return Math.floor((new Date(b) - new Date(a)) / 86400000); }

function linearSearch(arr, predicate){
  for(let i=0; i<arr.length; i++){ 
    if(predicate(arr[i])) return arr[i]; 
  }
  return null;
}

function bubbleSort(arr, compareFn){
  let n = arr.length;
  for(let i = 0; i < n - 1; i++){
    for(let j = 0; j < n - i - 1; j++){
      if(compareFn(arr[j], arr[j+1]) > 0){
        let temp = arr[j];
        arr[j] = arr[j+1];
        arr[j+1] = temp;
      }
    }
  }
  return arr;
}

function manualPush(arr, item){
  arr[arr.length] = item;
}

function toast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>{ el.textContent = ''; }, 2600);
}

function setMsg(elId, message, ok){
  const el = document.getElementById(elId);
  if(!el) return;
  el.textContent = (ok ? '' : 'Error: ') + message;
}

function seed(){
  manualPush(state.users, { id: nextId('U','user'), fullName:'System Administrator', username:'admin', password:'admin123', role:'Admin' });
}
seed();

/* =========================================================================
   USER ACCOUNTS MANAGEMENT
   ========================================================================= */
function populateUserEmployees(){
  const sel = document.getElementById('um-employee');
  if(!sel) return;
  sel.innerHTML = '<option value="">-- Select Linked Employee --</option>';
  for(let i=0; i<state.employees.length; i++){
    let emp = state.employees[i];
    sel.innerHTML += `<option value="${emp.id}">${escapeHtml(emp.name)} (${emp.id})</option>`;
  }
}

function registerUser({fullName, username, password, role, employeeId}){
  const exists = linearSearch(state.users, u => u.username.toLowerCase() === username.toLowerCase());
  if(exists) return { ok:false, message:'That username is already taken.' };
  const user = { id: nextId('U','user'), fullName, username, password, role, employeeId: employeeId || 'N/A' };
  manualPush(state.users, user);
  return { ok:true, user };
}

function loginUser(username, password){
  const user = linearSearch(state.users, u => u.username.toLowerCase() === username.toLowerCase());
  if(!user) return { ok:false, message:'No account with that username.' };
  if(user.password !== password) return { ok:false, message:'Incorrect password.' };
  return { ok:true, user };
}

function deleteUser(userId){
  let idx = -1;
  for(let i=0; i<state.users.length; i++){
    if(state.users[i].id.toLowerCase() === userId.toLowerCase()){
      idx = i;
      break;
    }
  }
  if(idx === -1) return { ok:false, message:'No account with that User ID.' };
  if(state.users[idx].id === state.currentUser?.id) return { ok:false, message:"You can't delete the account you're logged in as." };
  state.users.splice(idx,1);
  return { ok:true };
}

function renderUsers(){
  populateUserEmployees();
  const tbody = document.querySelector('#tbl-users tbody');
  tbody.innerHTML = state.users.length ? state.users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${escapeHtml(u.fullName)}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${u.role}</td>
      <td>${u.employeeId}</td>
      <td>
        <button class="btn-logout" style="width:auto; padding:4px 8px;" onclick="uiDeleteUserDirect('${u.id}')">Delete</button>
      </td>
    </tr>
  `).join('') : emptyRow(6,'No accounts yet.');
}

function uiRegisterUser(e){
  e.preventDefault();
  const fullName = val('um-fullname'), username = val('um-username'), password = val('um-password'), role = val('um-role'), employeeId = val('um-employee');
  const res = registerUser({fullName, username, password, role, employeeId});
  if(res.ok){
    setMsg('um-msg', `Account ${res.user.id} created for ${res.user.fullName}.`, true);
    e.target.reset();
    renderUsers();
  } else setMsg('um-msg', res.message, false);
  return false;
}

function uiDeleteUserDirect(id){
  const res = deleteUser(id);
  if(res.ok){ toast('Account deleted.'); renderUsers(); }
  else toast(res.message);
}

/* =========================================================================
   TRANSACTION MANAGEMENT
   ========================================================================= */
function autoComputeTxPrice(){
  const qty = parseFloat(val('tx-qty')) || 0;
  document.getElementById('tx-total').value = (qty * PRICE_PER_GALLON).toFixed(2);
}

function addTransaction({customerName, address, quantity, orderTotal, payment, employeeId, source, status}){
  const isPaid = status === 'Paid' || payment >= orderTotal;
  const change = isPaid ? +(payment - orderTotal).toFixed(2) : 0;
  const record = {
    id: nextId('TXN','tx'),
    date: todayISO(),
    customerName,
    address,
    quantity: Number(quantity),
    orderTotal: Number(orderTotal),
    payment: Number(payment),
    change,
    employeeId,
    source: source || 'Walk-in',
    status: isPaid ? 'Paid' : 'Unpaid'
  };
  manualPush(state.transactions, record);
  return record;
}

function markTransactionAsPaid(txnId){
  const t = linearSearch(state.transactions, t => t.id === txnId);
  if(!t) return;
  t.payment = t.orderTotal;
  t.change = 0;
  t.status = 'Paid';
  toast(`Transaction ${t.id} marked as Paid.`);
  renderTransactions();
  renderSales();
}

function renderTransactions(){
  const tbody = document.querySelector('#tbl-transactions tbody');
  tbody.innerHTML = state.transactions.length ? state.transactions.slice().reverse().map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${fmtDate(t.date)}</td>
      <td>${escapeHtml(t.customerName)}</td>
      <td>${t.quantity}</td>
      <td>${fmtMoney(t.orderTotal)}</td>
      <td>${fmtMoney(t.payment)}</td>
      <td>${fmtMoney(t.change)}</td>
      <td>${t.employeeId}</td>
      <td>${t.source}</td>
      <td><strong>${t.status}</strong></td>
      <td>
        ${t.status === 'Unpaid' ? `<button class="btn-primary" style="width:auto; padding:4px 8px; background:#10b981;" onclick="markTransactionAsPaid('${t.id}')">Mark Paid</button>` : '—'}
      </td>
    </tr>
  `).join('') : emptyRow(11,'No transactions recorded yet.');
  renderSales();
}

function uiAddTransaction(e){
  e.preventDefault();
  const customerName = val('tx-customer'), quantity = val('tx-qty'), orderTotal = parseFloat(val('tx-total')), payment = parseFloat(val('tx-payment'));
  if(payment < orderTotal){ setMsg('tx-msg','Payment cannot be less than the order total.', false); return false; }
  addTransaction({customerName, quantity, orderTotal, payment, employeeId: state.currentUser.id, source:'Walk-in', status:'Paid'});
  setMsg('tx-msg','Transaction completed.', true);
  e.target.reset();
  renderTransactions();
  return false;
}

/* =========================================================================
   SALES & PROFIT MANAGEMENT
   ========================================================================= */
function renderSales(){
  const from = val('sales-from'), to = val('sales-to');
  let filteredTx = state.transactions;
  let filteredBills = state.bills;

  if(from && to){
    filteredTx = [];
    for(let i=0; i<state.transactions.length; i++){
      let t = state.transactions[i];
      if(t.date >= from && t.date <= to) manualPush(filteredTx, t);
    }
    filteredBills = [];
    for(let i=0; i<state.bills.length; i++){
      let b = state.bills[i];
      if(b.datePaid >= from && b.datePaid <= to) manualPush(filteredBills, b);
    }
  }

  let totalSales = 0;
  let onHandCash = 0;
  for(let i=0; i<filteredTx.length; i++){
    totalSales += filteredTx[i].orderTotal;
    if(filteredTx[i].status === 'Paid'){
      onHandCash += filteredTx[i].orderTotal;
    }
  }

  let totalExpenses = 0;
  for(let i=0; i<filteredBills.length; i++){
    totalExpenses += filteredBills[i].amount;
  }

  document.getElementById('stat-sales').textContent = fmtMoney(totalSales);
  document.getElementById('stat-onhand').textContent = fmtMoney(onHandCash);
  document.getElementById('stat-expenses').textContent = fmtMoney(totalExpenses);
  document.getElementById('stat-profit').textContent = fmtMoney(onHandCash - totalExpenses);
}

/* =========================================================================
   BILLS, TAXES, AND EXPENSES MANAGEMENT
   ========================================================================= */
function populateEmployeeSalaryOptions(){
  const sel = document.getElementById('exp-emp');
  if(!sel) return;
  sel.innerHTML = '<option value="">-- Select Employee --</option>';
  for(let i=0; i<state.employees.length; i++){
    let emp = state.employees[i];
    sel.innerHTML += `<option value="${emp.id}" data-salary="${emp.salary}">${escapeHtml(emp.name)} (Base Salary: ${fmtMoney(emp.salary)})</option>`;
  }
}

function populateBillsMonths(){
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const sel = document.getElementById('bills-month');
  if(!sel) return;
  
  sel.innerHTML = '<option value="">All Months</option>' + 
    names.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    
  const now = new Date();
  const yearInput = document.getElementById('bills-year');
  if(yearInput) yearInput.value = now.getFullYear();
}

function resetBillsFilter(){
  document.getElementById('bills-month').value = '';
  document.getElementById('bills-year').value = '';
  renderBills();
}

function addBill({datePaid, billType, amount}){
  const record = { id: nextId('BILL','bill'), datePaid, billType, amount: Number(amount) };
  manualPush(state.bills, record);
  return record;
}

function renderBills(){
  populateEmployeeSalaryOptions();
  const mVal = document.getElementById('bills-month')?.value;
  const yVal = document.getElementById('bills-year')?.value;

  const month = (mVal !== "" && mVal !== null && mVal !== undefined) ? parseInt(mVal, 10): null;
  const year = yVal ? parseInt(yVal, 10) : null;

  let filteredBills = state.bills;

  if(month !== null || year !== null){
    filteredBills = [];
    for(let i = 0; i < state.bills.length; i++){
      const b = state.bills[i];
      if(!b.datePaid) continue;
      const d = new Date(b.datePaid);
      const matchMonth = (month === null) || (d.getMonth() === month);
      const matchYear = (year === null || isNaN(year)) || (d.getFullYear() === year);
      if(matchMonth && matchYear){
        manualPush(filteredBills, b);
      }
    }
  }
  const tbody = document.querySelector('#tbl-bills tbody');
  tbody.innerHTML = '';

  if(filteredBills.length === 0){
    tbody.innerHTML = emptyRow(5, 'No bills or expenses found for the selected period.');
  }else{
    for(let i = filteredBills.length - 1; i >= 0; i--){
      const b = filteredBills[i];
      let actions = '';

      if(state.currentUser.role === 'Admin'){
        actions = '<button class="btn-primary" ' + 'style="width:auto; padding:4px 8px;" ' + 'onclick="editBill(\'' + b.id + '\')">' +'Edit</button> ' +
          '<button class="btn-primary" ' + 'style="width:auto; padding:4px 8px; background:#ef4444;" ' + 'onclick="deleteBill(\'' + b.id + '\')">' + 'Delete</button>';
      }else{
       actions = '—';
      }

      const row = document.createElement('tr');
      row.innerHTML =
        '<td>' + b.id + '</td>' +
        '<td>' + fmtDate(b.datePaid) + '</td>' +
        '<td>' + escapeHtml(b.billType) + '</td>' +
        '<td>' + fmtMoney(b.amount) + '</td>' +
        '<td>' + actions + '</td>';
      tbody.appendChild(row);
    }
  }
  let total = 0;
  for(let i = 0; i < filteredBills.length; i++){
    total += filteredBills[i].amount;
  }
  document.getElementById('bills-grand-total').textContent = 'Total paid for selected period: ' + fmtMoney(total);
  renderSales();
}

function uiAddBill(e){
  e.preventDefault();
  addBill({ datePaid: val('bill-date'), billType: val('bill-type'), amount: parseFloat(val('bill-amount')) });
  toast('Bill/Tax recorded.');
  e.target.reset();
  renderBills();
  return false;
}

function uiAddExpense(e){
  e.preventDefault();
  const type = val('exp-type');
  let name = type;
  let amount = parseFloat(val('exp-amount'));
  if(type === 'Employee Salary'){
    const empId = val('exp-emp');
    const emp = linearSearch(state.employees, e => e.id === empId);
    if(emp) name = `Salary: ${emp.name} (${emp.id})`;
  }
  addBill({ datePaid: val('exp-date') || todayISO(), billType: name, amount });
  toast('Expense recorded.');
  e.target.reset();
  renderBills();
  return false;
}



/* =========================================================================
   DELIVERY MANAGEMENT
   ========================================================================= */
function autoComputeDeliveryPrice() {
  const qty = parseFloat(val('dl-qty')) || 0;
  document.getElementById('dl-price').value = (qty * PRICE_PER_GALLON).toFixed(2);
}
let editingDeliveryId = null;

function addDelivery({ customerName, address, quantity }) {
    const orderTotal = Number(quantity) * PRICE_PER_GALLON;

    if (editingDeliveryId !== null) {
        const delivery = linearSearch(state.deliveries, d => d.id === editingDeliveryId);

        if (delivery) {
            delivery.customerName = customerName;
            delivery.address = address;
            delivery.quantity = Number(quantity);
            delivery.orderTotal = orderTotal;
        }
        editingDeliveryId = null;
    } else {
        const record = {
            id: nextId('DLV', 'delivery'),
            dateAdded: todayISO(),
            customerName: customerName,
            address: address,
            quantity: Number(quantity),
            orderTotal: orderTotal,
            status: 'Pending Payment',
            delivered: false
        };
        manualPush(state.deliveries, record);
    }
    document.getElementById('dl-customer').value = '';
    document.getElementById('dl-address').value = '';
    document.getElementById('dl-qty').value = '';
    document.getElementById('dl-price').value = '';

    renderDelivery();
    renderAlerts();
}

function suggestCustomers() {
    const searchText = val('dl-customer').toLowerCase();
    const box = document.getElementById('customerSuggestions');
    box.innerHTML = '';

    if (searchText === '') {
        return;
    }

    for (let i = 0; i < state.transactions.length; i++) {
        const customer = state.transactions[i];
        const name = customer.customerName.toLowerCase();
        let match = false;

        for (let j = 0; j <= name.length - searchText.length; j++) {
            let same = true;
            for (let k = 0; k < searchText.length; k++) {
                if (name[j + k] !== searchText[k]) {
                    same = false;
                    break;
                }
            }

            if (same === true) {
                match = true;
                break;
            }
        }

        if (match === true) {
            const suggestion = document.createElement('div');
            suggestion.innerHTML =
                '<b>' + escapeHtml(customer.customerName) +
                '</b> — <small>' +
                escapeHtml(customer.address) + '</small>';

            suggestion.onclick = function() {
                document.getElementById('dl-customer').value = customer.customerName;
                document.getElementById('dl-address').value = customer.address;
                box.innerHTML = '';
            };
            box.appendChild(suggestion);
        }
    }
}

function selectCustomer(index) {
  document.getElementById('dl-customer').value = customerNames[index];
  document.getElementById('dl-address').value = customerAddresses[index];
  document.getElementById('customerSuggestions').innerHTML = '';
}

function setPaymentStatus(deliveryId, status) {
  const d = linearSearch(
    state.deliveries,
    d => d.id === deliveryId
  );

  if (!d) return;
  d.status = status;
  toast(`Delivery ${d.id} payment set to ${status}.`);
  renderDelivery();
}

function markDelivered(deliveryId) {
  const idx = state.deliveries.findIndex(
    d => d.id === deliveryId
  );

  if (idx === -1) return;
  const d = state.deliveries[idx];
  if (d.status !== 'Paid' && d.status !== 'Unpaid') {
    toast('Cannot mark delivered until payment status is confirmed!');
    return;
  }

  const orderTotal = d.orderTotal;
  addTransaction({
    customerName: d.customerName,
    address: d.address, 
    quantity: d.quantity,
    orderTotal: orderTotal,
    payment: d.status === 'Paid' ? orderTotal : 0,
    employeeId: state.currentUser.id,
    source: `Delivery (${d.status})`,
    status: d.status === 'Paid' ? 'Paid' : 'Unpaid'
  });

  state.deliveries.splice(idx, 1);
  toast(`Delivery ${d.id} completed & transaction recorded.`);
  renderDelivery();
  renderTransactions();
  renderAlerts();
}

function renderDelivery() {
  const tbody = document.querySelector('#tbl-delivery tbody');
  const isAdmin = state.currentUser && state.currentUser.role === 'Admin';
  const actionHeader = document.getElementById('deliveryActionsHeader');

  if (actionHeader) {
    actionHeader.style.display = isAdmin ? '' : 'none';
  }

  tbody.innerHTML = state.deliveries.length ? state.deliveries.map(d => {
        let actions = '';

        if (isAdmin) {
          actions =
            '<td>' +
              '<button class="btn-xs" onclick="editDelivery(\'' + d.id + '\')">Edit</button>' +
              '<button class="btn-xs btn-unpay" onclick="deleteDelivery(\'' + d.id + '\')">Delete</button>' +
            '</td>';
        }
        return `
          <tr>
            <td>${d.id}</td>
            <td>${fmtDate(d.dateAdded)}</td>
            <td>${escapeHtml(d.customerName)}</td>
            <td>${escapeHtml(d.address)}</td>
            <td>${d.quantity}</td>
            <td>₱${Number(d.orderTotal).toFixed(2)}</td>
            <td><strong>${d.status}</strong> </td>
            <td>
              <button class="btn-primary" style="width:auto; padding:4px 8px; background:#10b981;" onclick="setPaymentStatus('${d.id}', 'Paid')">Paid</button>
              <button class="btn-primary" style="width:auto; padding:4px 8px; background:#f59e0b;" onclick="setPaymentStatus('${d.id}', 'Unpaid')">Unpaid</button>
            </td>
            <td>
              <button class="btn-primary" style="width:auto; padding:4px 8px;" ${(d.status !== 'Paid' && d.status !== 'Unpaid') ? 'disabled style="opacity:0.5;"' : ''} onclick="markDelivered('${d.id}')">Mark Delivered </button>
            </td>${actions}
          </tr>
        `;
      }).join(''): emptyRow(9, 'No pending deliveries.');
}

function editDelivery(id) {
    const delivery = linearSearch( state.deliveries, d => d.id === id);

    if (!delivery) {
        alert('Delivery not found.');
        return;
    }
    editingDeliveryId = id;
    document.getElementById('dl-customer').value = delivery.customerName;
    document.getElementById('dl-address').value = delivery.address;
    document.getElementById('dl-qty').value = delivery.quantity;
    autoComputeDeliveryPrice();
}

function deleteDelivery(id) {
    const confirmDelete = confirm('Are you sure you want to delete this delivery?');

    if (!confirmDelete) {
        return;
    }
    let index = -1;
    for (let i = 0; i < state.deliveries.length; i++) {
        if (state.deliveries[i].id === id) {
            index = i;
            break;
        }
    }
    if (index !== -1) {
        for (let i = index; i < state.deliveries.length - 1; i++) {
            state.deliveries[i] = state.deliveries[i + 1];
        }
        state.deliveries.length = state.deliveries.length - 1;

        renderDelivery();
        renderAlerts();
    }
}
function uiAddDelivery(e) {
    e.preventDefault();

    addDelivery({
        customerName: val('dl-customer'),
        address: val('dl-address'),
        quantity: val('dl-qty')
    });
    return false;
}
/* =========================================================================
   EQUIPMENT MAINTENANCE MANAGEMENT
   ========================================================================= */
let lastMaintenanceByType = {};

function handleActionChange(){
  const action = val('mt-action');
  const typeSel = document.getElementById('mt-type');
  if(action === 'Backwash'){
    typeSel.value = 'N/A';
    typeSel.disabled = true;
  } else {
    typeSel.disabled = false;
  }
}

function addMaintenance({action, type, date}){
  const record = { id: nextId('MNT','maint'), date: date || todayISO(), action, type: action === 'Backwash' ? 'N/A' : type };
  manualPush(state.maintenance, record);
  
  if(action === 'Backwash'){
    lastMaintenanceByType['Backwash'] = record.date;
  } else {
    lastMaintenanceByType[type] = record.date;
  }

  let effect = 'Logged';
  if(action === 'Filter Replacement'){
    const item = linearSearch(state.inventory, i => i.itemName.toLowerCase().includes(type.toLowerCase()));
    if(item){
      stockOut(item.id, 1);
      effect = `−1 ${item.unit} from ${item.id}`;
    } else {
      effect = 'No matching inventory filter found';
    }
  } else {
    effect = 'System Backwash (No Filter Used)';
  }
  return { record, effect };
}

function renderMaintenance(){
  const tbody = document.querySelector('#tbl-maintenance tbody');
  tbody.innerHTML = state.maintenance.length ? state.maintenance.slice().reverse().map(m => `
    <tr><td>${m.id}</td><td>${fmtDate(m.date)}</td><td>${escapeHtml(m.action)}</td><td>${m.type}</td>
    <td>${m._effect || '—'}</td></tr>
  `).join('') : emptyRow(5,'No maintenance logged yet.');
}

function uiAddMaintenance(e){
  e.preventDefault();
  const action = val('mt-action'), type = val('mt-type'), date = val('mt-date') || todayISO();
  const { record, effect } = addMaintenance({action, type, date});
  record._effect = effect;
  setMsg('mt-msg', `Logged. Status: ${effect}`, true);
  e.target.reset();
  handleActionChange();
  renderMaintenance();
  renderInventory();
  renderAlerts();
  return false;
}

/* =========================================================================
   INVENTORY MANAGEMENT
   ========================================================================= */
function totalQty(item){ return item.batches.reduce((s,b)=>s+b.qty,0); }

function saveInventoryItem(data, editId){
  if(editId){
    const item = linearSearch(state.inventory, i => i.id === editId);
    if(item){
      item.itemName = data.itemName;
      item.itemType = data.itemType;
      item.unit = data.unit;
      item.minStock = Number(data.minStock)||0;
      item.batches = [{ qty: Number(data.quantity)||0, dateReceived: data.dateReceived || todayISO() }];
      return item;
    }
  }
  const item = {
    id: nextId('INV','inv'), 
    itemName: data.itemName, 
    itemType: data.itemType || 'General', 
    unit: data.unit, 
    minStock: Number(data.minStock)||0,
    batches: [{ qty: Number(data.quantity)||0, dateReceived: data.dateReceived || todayISO() }]
  };
  manualPush(state.inventory, item);
  return item;
}

function receiveIntoInventory({itemName, itemType, unit, quantity, dateReceived}){
  let item = linearSearch(state.inventory, i => i.itemName.toLowerCase() === itemName.toLowerCase());
  if(item){
    manualPush(item.batches, { qty:Number(quantity), dateReceived: dateReceived || todayISO() });
  } else {
    item = saveInventoryItem({ itemName, itemType: itemType || 'General', quantity, unit, dateReceived, minStock:5 }, null);
  }
  return item;
}

function stockOut(itemId, qtyToRemove){
  const item = linearSearch(state.inventory, i => i.id === itemId);
  if(!item) return { ok:false, message:'Item not found.' };
  let remaining = Number(qtyToRemove);
  if(remaining > totalQty(item)) return { ok:false, message:'Not enough stock on hand.' };
  
  bubbleSort(item.batches, (a,b) => new Date(a.dateReceived) - new Date(b.dateReceived));
  
  for(let i=0; i<item.batches.length; i++){
    let batch = item.batches[i];
    if(remaining <= 0) break;
    const take = Math.min(batch.qty, remaining);
    batch.qty -= take;
    remaining -= take;
  }
  
  let validBatches = [];
  for(let i=0; i<item.batches.length; i++){
    if(item.batches[i].qty > 0) manualPush(validBatches, item.batches[i]);
  }
  item.batches = validBatches;
  return { ok:true };
}

function inventoryStatus(item){
  const q = totalQty(item);
  if(q <= 0) return { label:'Out of Stock' };
  if(q <= item.minStock) return { label:'Low Stock' };
  return { label:'In Stock' };
}

function editInventoryItem(id){
  const item = linearSearch(state.inventory, i => i.id === id);
  if(!item) return;
  document.getElementById('inv-edit-id').value = item.id;
  document.getElementById('inv-name').value = item.itemName;
  document.getElementById('inv-type').value = item.itemType;
  document.getElementById('inv-qty').value = totalQty(item);
  document.getElementById('inv-unit').value = item.unit;
  document.getElementById('inv-received').value = item.batches[0]?.dateReceived || todayISO();
  document.getElementById('inv-min').value = item.minStock;
  document.getElementById('inv-form-title').textContent = `Modifying ${item.id}`;
  document.getElementById('inv-submit-btn').textContent = 'Save changes';
  document.getElementById('inv-cancel-btn').style.display = 'inline-block';
}

function cancelInventoryEdit(){
  document.getElementById('inv-edit-id').value = '';
  document.querySelector('#sec-inventory fieldset form').reset();
  document.getElementById('inv-form-title').textContent = 'Add / Modify Item';
  document.getElementById('inv-submit-btn').textContent = 'Save Item';
  document.getElementById('inv-cancel-btn').style.display = 'none';
}

function renderInventory(){
  const tbody = document.querySelector('#tbl-inventory tbody');
  tbody.innerHTML = state.inventory.length ? state.inventory.map(i => {
    const s = inventoryStatus(i);
    return `<tr>
      <td>${i.id}</td>
      <td>${escapeHtml(i.itemName)}</td>
      <td>${escapeHtml(i.itemType)}</td>
      <td>${totalQty(i)}</td>
      <td>${escapeHtml(i.unit)}</td>
      <td>${i.minStock}</td>
      <td>${s.label}</td>
      <td>
        <button class="btn-primary" style="width:auto; padding:4px 8px;" onclick="editInventoryItem('${i.id}')">Modify</button>
        <button class="btn-logout" style="width:auto; padding:4px 8px;" onclick="uiRemoveInventoryItem('${i.id}')">Remove</button>
      </td>
    </tr>`;
  }).join('') : emptyRow(8,'No inventory items yet.');
}

function uiSaveInventoryItem(e){
  e.preventDefault();
  const editId = val('inv-edit-id');
  const item = saveInventoryItem({
    itemName: val('inv-name'), 
    itemType: val('inv-type'), 
    quantity: val('inv-qty'), 
    unit: val('inv-unit'),
    dateReceived: val('inv-received'), 
    minStock: val('inv-min')
  }, editId || null);
  setMsg('inv-msg', editId ? `Item ${editId} updated.` : `Item ${item.id} added.`, true);
  cancelInventoryEdit();
  renderInventory();
  renderAlerts();
  return false;
}

function uiStockOut(e){
  e.preventDefault();
  const res = stockOut(val('stock-item-id').trim(), parseInt(val('stock-qty'),10));
  if(res.ok){ setMsg('stock-msg','Stock reduced (FIFO).', true); e.target.reset(); renderInventory(); renderAlerts(); }
  else setMsg('stock-msg', res.message, false);
  return false;
}

function uiRemoveInventoryItem(id){
  let idx = -1;
  for(let i=0; i<state.inventory.length; i++){
    if(state.inventory[i].id === id){ idx = i; break; }
  }
  if(idx > -1){
    state.inventory.splice(idx, 1);
    toast('Inventory item removed.');
    renderInventory();
    renderAlerts();
  }
}

/* =========================================================================
   SUPPLY RECEIVING MANAGEMENT
   ========================================================================= */
function populateSupplierDropdown(){
  const sel = document.getElementById('rc-supplier');
  if(!sel) return;
  sel.innerHTML = '<option value="">-- Select Supplier --</option>';
  for(let i=0; i<state.suppliers.length; i++){
    let sup = state.suppliers[i];
    sel.innerHTML += `<option value="${escapeHtml(sup.name)}">${escapeHtml(sup.name)}</option>`;
  }
}

function addReceiving({supplierName, itemName, itemType, quantity, unit, expectedDate}){
  const record = {
    id: nextId('RCV','recv'), supplierName, itemName, itemType: itemType || 'General', quantity:Number(quantity), unit,
    expectedDate, actualDate: '—', status:'Pending'
  };
  manualPush(state.receiving, record);
  return record;
}

function verifyReceiving(id){
  const rec = linearSearch(state.receiving, r => r.id === id);
  if(!rec || rec.status === 'Verified') return;
  rec.status = 'Verified';
  rec.actualDate = todayISO();
  receiveIntoInventory({ itemName: rec.itemName, itemType: rec.itemType, unit: rec.unit, quantity: rec.quantity, dateReceived: rec.actualDate });
  toast(`${rec.id} verified — added to Inventory.`);
  renderReceiving();
  renderInventory();
  renderAlerts();
}

function renderReceiving(){
  populateSupplierDropdown();
  const tbody = document.querySelector('#tbl-receiving tbody');
  tbody.innerHTML = state.receiving.length ? state.receiving.slice().reverse().map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${escapeHtml(r.supplierName)}</td>
      <td>${escapeHtml(r.itemName)}</td>
      <td>${escapeHtml(r.itemType)}</td>
      <td>${r.quantity}</td>
      <td>${escapeHtml(r.unit)}</td>
      <td>${fmtDate(r.expectedDate)}</td>
      <td>${fmtDate(r.actualDate)}</td>
      <td>${r.status}</td>
      <td>${r.status==='Verified' ? '' : `<button class="btn-primary" style="width:auto; padding:4px 8px;" onclick="verifyReceiving('${r.id}')">Verify</button>`}</td>
    </tr>
  `).join('') : emptyRow(10,'No receiving records yet.');
}

function uiAddReceiving(e){
  e.preventDefault();
  addReceiving({
    supplierName: val('rc-supplier'), itemName: val('rc-item'), itemType: val('rc-type'), quantity: val('rc-qty'), unit: val('rc-unit'),
    expectedDate: val('rc-expected')
  });
  toast('Supply receiving record logged.');
  e.target.reset();
  renderReceiving();
  return false;
}

/* =========================================================================
   INVENTORY REPLENISHMENT & ALERTS
   ========================================================================= */
function computeAlerts(){
  const alerts = [];

  for(let i=0; i<state.inventory.length; i++){
    let item = state.inventory[i];
    const s = inventoryStatus(item);
    if(s.label !== 'In Stock'){
      manualPush(alerts, { type: s.label, item: `${item.itemName} (${item.id})`, date: todayISO(), status: s.label,
        action: s.label === 'Out of Stock' ? 'Reorder immediately' : 'Schedule reorder' });
    }
  }

  for(let i=0; i<state.deliveries.length; i++){
    let d = state.deliveries[i];
    if(daysBetween(d.dateAdded, todayISO()) >= 1){
      manualPush(alerts, { type:'Undelivered Order (>1 Day)', item: `${d.customerName} (${d.id})`, date: d.dateAdded, status: d.status,
        action: 'Dispatch delivery immediately' });
    }
  }

  const maintSchedules = [
    { type: 'Micron Filter', days: 30 },
    { type: 'Carbon Block Filter', days: 90 },
    { type: 'CTO CocoPure Filter', days: 90 },
    { type: 'Backwash', days: 14 }
  ];

  for(let i=0; i<maintSchedules.length; i++){
    let sched = maintSchedules[i];
    let lastDate = lastMaintenanceByType[sched.type] || null;
    if(lastDate === null || daysBetween(lastDate, todayISO()) >= sched.days){
      manualPush(alerts, { 
        type: sched.type === 'Backwash' ? 'Backwash Due' : 'Filter Change Due', 
        item: sched.type, 
        date: lastDate || '—',
        status: lastDate ? `${daysBetween(lastDate, todayISO())}d since last service` : 'Never logged',
        action: sched.type === 'Backwash' ? 'Perform Backwash' : 'Replace Filter' 
      });
    }
  }

  return alerts;
}

function renderAlerts(){
  const alerts = computeAlerts();
  const tbody = document.querySelector('#tbl-alerts tbody');
  tbody.innerHTML = alerts.length ? alerts.map(a => `
    <tr><td>${a.type}</td><td>${escapeHtml(a.item)}</td>
    <td>${fmtDate(a.date)}</td><td>${escapeHtml(a.status)}</td><td>${escapeHtml(a.action)}</td></tr>
  `).join('') : emptyRow(5,'Nothing needs attention right now.');

  let lowStockCount = 0, deliveryCount = 0, maintCount = 0;
  for(let i=0; i<alerts.length; i++){
    if(alerts[i].type==='Low Stock'||alerts[i].type==='Out of Stock') lowStockCount++;
    if(alerts[i].type.includes('Undelivered')) deliveryCount++;
    if(alerts[i].type.includes('Due')) maintCount++;
  }

  document.getElementById('alert-count-stock').textContent = lowStockCount;
  document.getElementById('alert-count-delivery').textContent = deliveryCount;
  document.getElementById('alert-count-maint').textContent = maintCount;
}

/* =========================================================================
   EMPLOYEE MANAGEMENT
   ========================================================================= */
function saveEmployee(data, editId){
  if(editId){
    const emp = linearSearch(state.employees, e => e.id === editId);
    if(emp) Object.assign(emp, data);
    return emp;
  }
  const emp = { id: nextId('EMP','emp'), ...data, balance: Number(data.balance)||0 };
  manualPush(state.employees, emp);
  return emp;
}

function deleteEmployee(id){
  let idx = -1;
  for(let i=0; i<state.employees.length; i++){
    if(state.employees[i].id === id){ idx = i; break; }
  }
  if(idx > -1) state.employees.splice(idx,1);
  renderEmployees();
  renderUsers();
}

function renderEmployees(){
  const q = (document.getElementById('emp-search')?.value || '').toLowerCase();
  let rows = [];
  for(let i=0; i<state.employees.length; i++){
    let e = state.employees[i];
    if(!q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)){
      manualPush(rows, e);
    }
  }
  
  bubbleSort(rows, (a,b) => a.name.localeCompare(b.name));

  const tbody = document.querySelector('#tbl-employees tbody');
  tbody.innerHTML = rows.length ? rows.map(e => `
    <tr>
      <td>${e.id}</td>
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.contact)}</td>
      <td>${escapeHtml(e.role)}</td>
      <td>${fmtMoney(e.salary)}</td>
      <td><strong style="color:${e.balance > 0 ? '#dc2626' : '#16a34a'};">${fmtMoney(e.balance)}</strong></td>
      <td>
        <button class="btn-primary" style="width:auto; padding:4px 8px;" onclick="editEmployee('${e.id}')">Modify</button>
        <button class="btn-logout" style="width:auto; padding:4px 8px;" onclick="deleteEmployee('${e.id}')">Delete</button>
      </td>
    </tr>
  `).join('') : emptyRow(7,'No employee records yet.');
}

function editEmployee(id){
  const emp = linearSearch(state.employees, e => e.id === id);
  if(!emp) return;
  document.getElementById('emp-edit-id').value = emp.id;
  document.getElementById('emp-name').value = emp.name;
  document.getElementById('emp-contact').value = emp.contact;
  document.getElementById('emp-role').value = emp.role;
  document.getElementById('emp-salary').value = emp.salary;
  document.getElementById('emp-balance').value = emp.balance || 0;
  document.getElementById('emp-form-title').textContent = `Editing ${emp.id}`;
  document.getElementById('emp-submit-btn').textContent = 'Save changes';
  document.getElementById('emp-cancel-btn').style.display = 'inline-block';
}

function cancelEmployeeEdit(){
  document.getElementById('emp-edit-id').value = '';
  document.querySelector('#sec-employees form').reset();
  document.getElementById('emp-form-title').textContent = 'Add an employee';
  document.getElementById('emp-submit-btn').textContent = 'Add employee';
  document.getElementById('emp-cancel-btn').style.display = 'none';
}

function uiSaveEmployee(e){
  e.preventDefault();
  const editId = val('emp-edit-id');
  saveEmployee({ 
    name: val('emp-name'), 
    contact: val('emp-contact'), 
    role: val('emp-role'), 
    salary: parseFloat(val('emp-salary')),
    balance: parseFloat(val('emp-balance')) || 0
  }, editId || null);
  toast(editId ? 'Employee record updated.' : 'Employee added.');
  cancelEmployeeEdit();
  renderEmployees();
  renderBills();
  renderUsers();
  return false;
}

/* =========================================================================
   SUPPLIER MANAGEMENT
   ========================================================================= */
function saveSupplier(data, editId){
  if(editId){
    const sup = linearSearch(state.suppliers, s => s.id === editId);
    if(sup) Object.assign(sup, data);
    return sup;
  }
  const sup = { id: nextId('SUP','sup'), ...data };
  manualPush(state.suppliers, sup);
  return sup;
}

function deleteSupplier(id){
  let idx = -1;
  for(let i=0; i<state.suppliers.length; i++){
    if(state.suppliers[i].id === id){ idx = i; break; }
  }
  if(idx > -1) state.suppliers.splice(idx,1);
  renderSuppliers();
}

function renderSuppliers(){
  const q = (document.getElementById('sup-search')?.value || '').toLowerCase();
  let rows = [];
  for(let i=0; i<state.suppliers.length; i++){
    let s = state.suppliers[i];
    if(!q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)){
      manualPush(rows, s);
    }
  }

  bubbleSort(rows, (a,b) => a.name.localeCompare(b.name));

  const tbody = document.querySelector('#tbl-suppliers tbody');
  tbody.innerHTML = rows.length ? rows.map(s => `
    <tr>
      <td>${s.id}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.contact)}</td>
      <td>${escapeHtml(s.address)}</td>
      <td>
        <button class="btn-primary" style="width:auto; padding:4px 8px;" onclick="editSupplier('${s.id}')">Modify</button>
        <button class="btn-logout" style="width:auto; padding:4px 8px;" onclick="deleteSupplier('${s.id}')">Delete</button>
      </td>
    </tr>
  `).join('') : emptyRow(5,'No supplier records yet.');
}

function editSupplier(id){
  const sup = linearSearch(state.suppliers, s => s.id === id);
  if(!sup) return;
  document.getElementById('sup-edit-id').value = sup.id;
  document.getElementById('sup-name').value = sup.name;
  document.getElementById('sup-contact').value = sup.contact;
  document.getElementById('sup-address').value = sup.address || '';
  document.getElementById('sup-form-title').textContent = `Editing ${sup.id}`;
  document.getElementById('sup-submit-btn').textContent = 'Save changes';
  document.getElementById('sup-cancel-btn').style.display = 'inline-block';
}

function cancelSupplierEdit(){
  document.getElementById('sup-edit-id').value = '';
  document.querySelector('#sec-suppliers form').reset();
  document.getElementById('sup-form-title').textContent = 'Add a supplier';
  document.getElementById('sup-submit-btn').textContent = 'Add supplier';
  document.getElementById('sup-cancel-btn').style.display = 'none';
}

function uiSaveSupplier(e){
  e.preventDefault();
  const editId = val('sup-edit-id');
  saveSupplier({
    name: val('sup-name'), contact: val('sup-contact'), address: val('sup-address')
  }, editId || null);
  toast(editId ? 'Supplier record updated.' : 'Supplier added.');
  cancelSupplierEdit();
  renderSuppliers();
  renderReceiving();
  return false;
}

/* =========================================================================
   REPORTS MANAGEMENT
   ========================================================================= */
function populateReportMonths(){
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const sel1 = document.getElementById('rep-month-1'), sel2 = document.getElementById('rep-month-2');
  if(!sel1 || !sel2) return;
  
  const options = names.map((n,i) => `<option value="${i}">${n}</option>`).join('');
  sel1.innerHTML = options;
  sel2.innerHTML = options;
  
  const now = new Date();
  sel1.value = now.getMonth();
  sel2.value = now.getMonth();
  document.getElementById('rep-year-1').value = now.getFullYear();
  document.getElementById('rep-year-2').value = now.getFullYear();
}

function generateSingleReportData(month, year){
  const inRange = (dateStr) => { const d = new Date(dateStr); return d.getMonth()===month && d.getFullYear()===year; };
  let txs = [], bills = [];
  
  for(let i=0; i<state.transactions.length; i++){
    if(inRange(state.transactions[i].date)) manualPush(txs, state.transactions[i]);
  }
  for(let i=0; i<state.bills.length; i++){
    if(inRange(state.bills[i].datePaid)) manualPush(bills, state.bills[i]);
  }

  let sales = 0;
  for(let i=0; i<txs.length; i++) sales += txs[i].orderTotal;
  
  let expenses = 0;
  for(let i=0; i<bills.length; i++) expenses += bills[i].amount;

  return { orders: txs.length, sales, expenses, profit: sales - expenses };
}

function renderReport(){
  const m1 = parseInt(val('rep-month-1'),10), y1 = parseInt(val('rep-year-1'),10);
  const m2 = parseInt(val('rep-month-2'),10), y2 = parseInt(val('rep-year-2'),10);

  const r1 = generateSingleReportData(m1, y1);
  const r2 = generateSingleReportData(m2, y2);

  document.getElementById('rep1-orders').textContent = r1.orders;
  document.getElementById('rep1-sales').textContent = fmtMoney(r1.sales);
  document.getElementById('rep1-expenses').textContent = fmtMoney(r1.expenses);
  document.getElementById('rep1-profit').textContent = fmtMoney(r1.profit);

  document.getElementById('rep2-orders').textContent = r2.orders;
  document.getElementById('rep2-sales').textContent = fmtMoney(r2.sales);
  document.getElementById('rep2-expenses').textContent = fmtMoney(r2.expenses);
  document.getElementById('rep2-profit').textContent = fmtMoney(r2.profit);
}

/* ---------------------------------------------------------------------
   DOM Utilities
   --------------------------------------------------------------------- */
function val(id){ return document.getElementById(id).value.trim(); }
function emptyRow(colspan, text){ return `<tr><td colspan="${colspan}">${text}</td></tr>`; }
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderAll(){
  renderUsers(); renderTransactions(); renderSales(); renderBills(); renderDelivery();
  renderMaintenance(); renderInventory(); renderReceiving(); renderAlerts();
  renderEmployees(); renderSuppliers(); renderReport();
}

/* ---------------------------------------------------------------------
   Authentication Handlers
   --------------------------------------------------------------------- */
function switchAuthTab(tab){
  document.getElementById('login-form-wrap').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('register-form-wrap').style.display = tab === 'register' ? '' : 'none';
}

function handleLogin(e){
  e.preventDefault();
  const res = loginUser(val('login-username'), val('login-password'));
  const errEl = document.getElementById('login-error');
  if(!res.ok){ errEl.textContent = res.message; errEl.hidden = false; return false; }
  errEl.hidden = true;
  enterApp(res.user);
  return false;
}

function handleRegister(e){
  e.preventDefault();
  const res = registerUser({ fullName: val('reg-fullname'), username: val('reg-username'), password: val('reg-password'), role: val('reg-role') });
  const errEl = document.getElementById('register-error'), okEl = document.getElementById('register-success');
  if(!res.ok){ errEl.textContent = res.message; errEl.hidden = false; okEl.hidden = true; return false; }
  errEl.hidden = true; okEl.hidden = false;
  okEl.textContent = `Account ${res.user.id} created. You can log in now.`;
  e.target.reset();
  setTimeout(() => switchAuthTab('login'), 900);
  return false;
}

function handleLogout(){
  state.currentUser = null;
  document.getElementById('app-layout').style.display = 'none';
  document.getElementById('auth-wrapper').style.display = 'block';

  for(let i=0; i<NAV_ITEMS.length; i++){
    const sec = document.getElementById('sec-' + NAV_ITEMS[i].id);
    if (sec) sec.style.display = 'none';
  }

  document.getElementById('section-title').textContent = '';
  document.getElementById('login-form-wrap').style.display = '';
  document.getElementById('login-form').reset();
}

/* ---------------------------------------------------------------------
   Navigation Controller
   --------------------------------------------------------------------- */
const NAV_ITEMS = [
  { id:'transactions', label:'Transactions', group:'Operations' },
  { id:'delivery', label:'Delivery', group:'Operations' },
  { id:'maintenance', label:'Equipment Maintenance', group:'Operations' },
  { id:'inventory', label:'Inventory', group:'Operations' },
  { id:'receiving', label:'Supply Receiving', group:'Operations' },
  { id:'alerts', label:'Alerts', group:'Operations', adminOnly:true },
  { id:'sales', label:'Sales & Profit', group:'Management', adminOnly:true },
  { id:'bills', label:'Bills, Taxes, and Expenses', group:'Management', adminOnly:true },
  { id:'employees', label:'Employees', group:'Management', adminOnly:true },
  { id:'suppliers', label:'Suppliers', group:'Management', adminOnly:true },
  { id:'reports', label:'Reports', group:'Management', adminOnly:true },
  { id:'users', label:'User Accounts', group:'Management', adminOnly:true },
];

function buildNav(role){
  const nav = document.getElementById('sidebar-nav');
  let html = '';
  let currentGroup = null;
  for(let i=0; i<NAV_ITEMS.length; i++){
    let item = NAV_ITEMS[i];
    if(!item.adminOnly || role === 'Admin'){
      if(item.group !== currentGroup){
        html += `<li style="padding:10px 16px 4px; font-size:0.75rem; text-transform:uppercase; color:rgba(255,255,255,0.5); font-weight:bold;">${item.group}</li>`;
        currentGroup = item.group;
      }
      html += `<li><button id="nav-btn-${item.id}" data-section="${item.id}" onclick="showSection('${item.id}')">${item.label}</button></li>`;
    }
  }
  nav.innerHTML = html;
}

function showSection(id){
  for(let i=0; i<NAV_ITEMS.length; i++){
    let item = NAV_ITEMS[i];
    const sec = document.getElementById('sec-' + item.id);
    const navBtn = document.getElementById('nav-btn-' + item.id);
    if (sec) {
      sec.style.display = (item.id === id) ? '' : 'none';
    }
    if (navBtn) {
      if (item.id === id) navBtn.classList.add('active');
      else navBtn.classList.remove('active');
    }
  }

  const item = linearSearch(NAV_ITEMS, n => n.id === id);
  document.getElementById('section-title').textContent = item ? item.label : '';
  if(id === 'reports') renderReport();
  if(id === 'alerts') renderAlerts();
}

function enterApp(user){
  state.currentUser = user;
  document.getElementById('auth-wrapper').style.display = 'none';
  document.getElementById('app-layout').style.display = 'flex';

  document.getElementById('user-name').textContent = user.fullName;
  document.getElementById('user-role-badge').textContent = user.role;
  buildNav(user.role);
  showSection('transactions');
  renderAll();
}

/* ---------------------------------------------------------------------
   Initialization
   --------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  populateReportMonths();
  populateBillsMonths();
  const mtDate = document.getElementById('mt-date');
  if(mtDate) mtDate.value = todayISO();
  const billDate = document.getElementById('bill-date');
  if(billDate) billDate.value = todayISO();
  const expDate = document.getElementById('exp-date');
  if(expDate) expDate.value = todayISO();
});
