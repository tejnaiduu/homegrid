import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const { default: app } = await import('../src/app.js');
const { connectDatabase } = await import('../src/config/db.js');

async function requestJson(server, path, options = {}, cookieHeader = '') {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: body ? JSON.parse(body) : null,
      }));
    });
    request.on('error', reject);
    if (options.body) request.write(JSON.stringify(options.body));
    request.end();
  });
}

async function createTestServer() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  const memoryServer = await MongoMemoryServer.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = memoryServer.getUri();
  await connectDatabase();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { memoryServer, server };
}

test('customer return requests reserve returnable quantity and shop approval restores stock', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const User = (await import('../src/models/User.js')).default;
    const Customer = (await import('../src/models/Customer.js')).default;
    const House = (await import('../src/models/House.js')).default;
    const MaterialRequest = (await import('../src/models/MaterialRequest.js')).default;
    const Shop = (await import('../src/models/Shop.js')).default;
    const ShopBranch = (await import('../src/models/ShopBranch.js')).default;
    const InventoryItem = (await import('../src/models/InventoryItem.js')).default;
    const ShopOrder = (await import('../src/models/ShopOrder.js')).default;
    const Invoice = (await import('../src/models/Invoice.js')).default;
    const InventoryMovement = (await import('../src/models/InventoryMovement.js')).default;
    const ReturnRequest = (await import('../src/models/ReturnRequest.js')).default;
    const CreditNote = (await import('../src/models/CreditNote.js')).default;

    const passwordHash = await User.hashPassword('ReturnPass1!');
    const electrician = await User.create({
      name: 'Return Test Electrician',
      email: 'return-electrician@example.com',
      phone: '9999000201',
      passwordHash,
      roles: ['ELECTRICIAN'],
      accountStatus: 'ACTIVE',
    });
    const customerUser = await User.create({
      name: 'Return Test Customer',
      email: 'return-customer@example.com',
      phone: '9999000202',
      passwordHash,
      roles: ['CUSTOMER'],
      accountStatus: 'ACTIVE',
    });
    const shopOwner = await User.create({
      name: 'Return Test Shop Owner',
      email: 'return-shop@example.com',
      phone: '9999000203',
      passwordHash,
      roles: ['SHOP_OWNER'],
      accountStatus: 'ACTIVE',
    });
    const secondShopOwner = await User.create({
      name: 'Second Return Test Shop Owner',
      email: 'return-shop-two@example.com',
      phone: '9999000204',
      passwordHash,
      roles: ['SHOP_OWNER'],
      accountStatus: 'ACTIVE',
    });

    async function login(identifier) {
      const response = await requestJson(server, '/api/v1/auth/login', {
        method: 'POST',
        body: { identifier, password: 'ReturnPass1!' },
      });
      assert.equal(response.statusCode, 200);
      return response.headers['set-cookie']?.[0]?.split(';')[0] || '';
    }

    const customerCookie = await login(customerUser.email);
    const shopCookie = await login(shopOwner.email);
    const secondShopCookie = await login(secondShopOwner.email);
    const customer = await Customer.create({
      createdByElectricianId: electrician._id,
      linkedUserId: customerUser._id,
      name: customerUser.name,
      phone: customerUser.phone,
      email: customerUser.email,
    });
    const house = await House.create({
      createdByElectricianId: electrician._id,
      customerId: customer._id,
      houseName: 'Return Test House',
      address: { line1: '1 Test Lane', city: 'Bengaluru' },
    });
    const shop = await Shop.create({
      ownerUserId: shopOwner._id,
      businessName: 'Return Test Electricals',
      contactPhone: shopOwner.phone,
      verificationStatus: 'VERIFIED',
    });
    const branch = await ShopBranch.create({
      shopId: shop._id,
      branchName: 'Return Test Branch',
      address: { line1: '2 Test Lane', city: 'Bengaluru' },
    });
    const secondShop = await Shop.create({
      ownerUserId: secondShopOwner._id,
      businessName: 'Second Return Test Electricals',
      contactPhone: secondShopOwner.phone,
      verificationStatus: 'VERIFIED',
    });
    const secondBranch = await ShopBranch.create({
      shopId: secondShop._id,
      branchName: 'Second Return Test Branch',
      address: { line1: '3 Test Lane', city: 'Bengaluru' },
    });
    const inventory = await InventoryItem.create({
      branchId: branch._id,
      sku: 'RETURN-TEST-ITEM',
      customName: 'Return Test Lamp',
      unit: 'PCS',
      quantityOnHand: 0,
      quantityReserved: 0,
      sellingPricePaise: 10000,
    });
    const request = await MaterialRequest.create({
      requestCode: 'EL-RETURN-FLOW-001',
      electricianId: electrician._id,
      customerId: customer._id,
      houseId: house._id,
      status: 'FULFILLED',
      shopAccess: { mode: 'ANY_REGISTERED_SHOP', approvedShopIds: [] },
      items: [{
        itemId: 'return-test-line',
        itemType: 'CUSTOM',
        name: 'Return Test Lamp',
        unit: 'PCS',
        requestedQty: 5,
        fulfilledQty: 5,
      }],
    });
    const order = await ShopOrder.create({
      orderCode: 'OR-RETURN-FLOW-001',
      idempotencyKey: 'return-flow-order-key',
      requestId: request._id,
      shopId: shop._id,
      branchId: branch._id,
      customerId: customer._id,
      createdByShopUserId: shopOwner._id,
      status: 'FULFILLED',
      lines: [{
        requestItemId: 'return-test-line',
        inventoryItemId: inventory._id,
        itemNameSnapshot: 'Return Test Lamp',
        unit: 'PCS',
        offeredQty: 5,
        approvedQty: 5,
        fulfilledQty: 5,
        unitPricePaise: 10000,
      }],
      subtotalPaise: 50000,
      totalPaise: 50000,
      fulfilledAt: new Date(),
    });
    await Invoice.create({
      invoiceNumber: 'INV-RETURN-FLOW-001',
      requestId: request._id,
      orderId: order._id,
      shopId: shop._id,
      branchId: branch._id,
      customerId: customer._id,
      sellerSnapshot: { businessName: shop.businessName },
      buyerSnapshot: { name: customer.name },
      lines: [{ requestItemId: 'return-test-line', itemName: 'Return Test Lamp', quantity: 5, unit: 'PCS', unitPricePaise: 10000, lineTotalPaise: 50000 }],
      subtotalPaise: 50000,
      totalPaise: 50000,
    });

    const createReturn = await requestJson(server, `/api/v1/requests/${request._id}/returns`, {
      method: 'POST',
      body: { orderId: order._id, lineIndex: 0, quantity: 2, reason: 'Item not needed' },
    }, customerCookie);
    assert.equal(createReturn.statusCode, 201);
    assert.equal(createReturn.body.data.returnRequest.status, 'PENDING');

    const customerReturns = await requestJson(server, `/api/v1/requests/${request._id}/returns`, {}, customerCookie);
    assert.equal(customerReturns.statusCode, 200);
    assert.equal(customerReturns.body.data.returns.length, 1);
    assert.equal(customerReturns.body.data.returns[0].orderId.orderCode, order.orderCode);

    const shopCannotRequestReturn = await requestJson(server, `/api/v1/requests/${request._id}/returns`, {
      method: 'POST',
      body: { orderId: order._id, lineIndex: 0, quantity: 1, reason: 'Wrong role' },
    }, shopCookie);
    assert.equal(shopCannotRequestReturn.statusCode, 403);

    const overReturn = await requestJson(server, `/api/v1/requests/${request._id}/returns`, {
      method: 'POST',
      body: { orderId: order._id, lineIndex: 0, quantity: 4, reason: 'Exceeds remaining quantity' },
    }, customerCookie);
    assert.equal(overReturn.statusCode, 409);

    const shopReturns = await requestJson(server, '/api/v1/shop/returns?status=PENDING', {}, shopCookie);
    assert.equal(shopReturns.statusCode, 200);
    assert.equal(shopReturns.body.data.returns.length, 1);
    assert.equal(shopReturns.body.data.returns[0].customerId.name, customer.name);

    const pendingLookup = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-FLOW-001', {}, shopCookie);
    assert.equal(pendingLookup.body.data.items[0].remainingQty, 0);
    assert.equal((await InventoryItem.findById(inventory._id)).quantityOnHand, 0);
    const requestWithPendingReturn = await requestJson(server, `/api/v1/requests/${request._id}`, {}, customerCookie);
    assert.equal(requestWithPendingReturn.body.data.request.items[0].returnedQty, 0);
    const pendingOrder = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-FLOW-001/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'return-flow-pending-key' },
      body: {
        branchId: branch._id,
        lines: [{ requestItemId: 'return-test-line', inventoryItemId: inventory._id, offeredQty: 1 }],
      },
    }, shopCookie);
    assert.equal(pendingOrder.statusCode, 409);

    const approval = await requestJson(server, `/api/v1/shop/returns/${createReturn.body.data.returnRequest._id}/decision`, {
      method: 'POST',
      body: { decision: 'APPROVE' },
    }, shopCookie);
    assert.equal(approval.statusCode, 200);
    assert.equal(approval.body.data.returnRequest.status, 'APPROVED');
    assert.equal((await InventoryItem.findById(inventory._id)).quantityOnHand, 2);
    assert.equal(await InventoryMovement.countDocuments({ referenceId: createReturn.body.data.returnRequest._id, movementType: 'RETURN_IN', quantity: 2 }), 1);

    const duplicateApproval = await requestJson(server, `/api/v1/shop/returns/${createReturn.body.data.returnRequest._id}/decision`, {
      method: 'POST',
      body: { decision: 'APPROVE' },
    }, shopCookie);
    assert.equal(duplicateApproval.statusCode, 409);
    assert.equal((await InventoryItem.findById(inventory._id)).quantityOnHand, 2);
    assert.equal(await InventoryMovement.countDocuments({ referenceId: createReturn.body.data.returnRequest._id, movementType: 'RETURN_IN' }), 1);

    const requestLookup = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-FLOW-001', {}, shopCookie);
    assert.equal(requestLookup.statusCode, 200);
    assert.equal(requestLookup.body.data.items[0].remainingQty, 2);
    const overPurchase = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-FLOW-001/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'return-flow-overpurchase-key' },
      body: {
        branchId: branch._id,
        lines: [{ requestItemId: 'return-test-line', inventoryItemId: inventory._id, offeredQty: 3 }],
      },
    }, shopCookie);
    assert.equal(overPurchase.statusCode, 409);
    const repurchase = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-FLOW-001/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'return-flow-repurchase-key' },
      body: {
        branchId: branch._id,
        lines: [{ requestItemId: 'return-test-line', inventoryItemId: inventory._id, offeredQty: 2 }],
      },
    }, shopCookie);
    assert.equal(repurchase.statusCode, 201);
    assert.equal((await InventoryItem.findById(inventory._id)).quantityReserved, 2);
    const repurchaseFulfilment = await requestJson(server, `/api/v1/shop/orders/${repurchase.body.data.order._id}/fulfil`, {
      method: 'POST',
    }, shopCookie);
    assert.equal(repurchaseFulfilment.statusCode, 200);
    assert.equal(repurchaseFulfilment.body.data.order.status, 'FULFILLED');
    assert.equal(repurchaseFulfilment.body.data.invoice.lines[0].quantity, 2);
    assert.equal((await InventoryItem.findById(inventory._id)).quantityOnHand, 0);
    assert.equal((await InventoryItem.findById(inventory._id)).quantityReserved, 0);

    const customerRequestAfterRepurchase = await requestJson(server, `/api/v1/requests/${request._id}`, {}, customerCookie);
    assert.equal(customerRequestAfterRepurchase.statusCode, 200);
    assert.equal(customerRequestAfterRepurchase.body.data.request.status, 'FULFILLED');
    assert.equal(customerRequestAfterRepurchase.body.data.request.items[0].requestedQty, 5);
    assert.equal(customerRequestAfterRepurchase.body.data.request.items[0].fulfilledQty, 7);
    assert.equal(customerRequestAfterRepurchase.body.data.request.items[0].returnedQty, 2);
    assert.equal(await Invoice.countDocuments({ requestId: request._id, status: 'ISSUED' }), 2);
    assert.equal((await Invoice.findOne({ orderId: order._id })).lines[0].quantity, 5);

    const rejectedReturn = await requestJson(server, `/api/v1/requests/${request._id}/returns`, {
      method: 'POST',
      body: { orderId: order._id, lineIndex: 0, quantity: 3, reason: 'Remaining units' },
    }, customerCookie);
    assert.equal(rejectedReturn.statusCode, 201);
    const rejection = await requestJson(server, `/api/v1/shop/returns/${rejectedReturn.body.data.returnRequest._id}/decision`, {
      method: 'POST',
      body: { decision: 'REJECT', reason: 'Packaging is damaged' },
    }, shopCookie);
    assert.equal(rejection.statusCode, 200);
    assert.equal(rejection.body.data.returnRequest.status, 'REJECTED');
    assert.equal((await InventoryItem.findById(inventory._id)).quantityOnHand, 0);
    const requestAfterRejection = await requestJson(server, `/api/v1/requests/${request._id}`, {}, customerCookie);
    assert.equal(requestAfterRejection.body.data.request.items[0].returnedQty, 2);
    assert.equal(requestAfterRejection.body.data.request.status, 'FULFILLED');

    const updatedOrder = await ShopOrder.findById(order._id);
    assert.equal(updatedOrder.lines[0].returnApprovedQty, 2);
    assert.equal(updatedOrder.lines[0].returnPendingQty, 0);
    assert.equal(await CreditNote.countDocuments({ orderId: order._id }), 0);
    const customerReturnsAfterDecision = await requestJson(server, `/api/v1/requests/${request._id}/returns`, {}, customerCookie);
    assert.deepEqual(customerReturnsAfterDecision.body.data.returns.map((entry) => entry.status).sort(), ['APPROVED', 'REJECTED']);
    const rejectedLookup = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-FLOW-001', {}, shopCookie);
    assert.equal(rejectedLookup.body.data.items[0].remainingQty, 0);

    const fullInventory = await InventoryItem.create({
      branchId: branch._id,
      sku: 'RETURN-FULL-ITEM',
      customName: 'Full Return Lamp',
      unit: 'PCS',
      quantityOnHand: 5,
      quantityReserved: 0,
      sellingPricePaise: 12000,
    });
    const fullRequest = await MaterialRequest.create({
      requestCode: 'EL-RETURN-FULL-001',
      electricianId: electrician._id,
      customerId: customer._id,
      houseId: house._id,
      shopAccess: { mode: 'ANY_REGISTERED_SHOP', approvedShopIds: [] },
      items: [{
        itemId: 'full-return-line',
        itemType: 'CUSTOM',
        name: 'Full Return Lamp',
        unit: 'PCS',
        requestedQty: 5,
      }],
    });
    const initialFullOrder = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-FULL-001/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'full-return-initial-key' },
      body: {
        branchId: branch._id,
        lines: [{ requestItemId: 'full-return-line', inventoryItemId: fullInventory._id, offeredQty: 5 }],
      },
    }, shopCookie);
    assert.equal(initialFullOrder.statusCode, 201);
    const initialFullFulfilment = await requestJson(server, `/api/v1/shop/orders/${initialFullOrder.body.data.order._id}/fulfil`, {
      method: 'POST',
    }, shopCookie);
    assert.equal(initialFullFulfilment.statusCode, 200);
    const initialFullInvoiceId = initialFullFulfilment.body.data.invoice._id;

    const fullReturn = await requestJson(server, `/api/v1/requests/${fullRequest._id}/returns`, {
      method: 'POST',
      body: { orderId: initialFullOrder.body.data.order._id, lineIndex: 0, quantity: 5, reason: 'Return all items' },
    }, customerCookie);
    assert.equal(fullReturn.statusCode, 201);
    const fullReturnApproval = await requestJson(server, `/api/v1/shop/returns/${fullReturn.body.data.returnRequest._id}/decision`, {
      method: 'POST',
      body: { decision: 'APPROVE' },
    }, shopCookie);
    assert.equal(fullReturnApproval.statusCode, 200);
    assert.equal((await InventoryItem.findById(fullInventory._id)).quantityOnHand, 5);
    const fullRequestAfterReturn = await requestJson(server, `/api/v1/requests/${fullRequest._id}`, {}, customerCookie);
    assert.equal(fullRequestAfterReturn.body.data.request.status, 'OPEN');
    assert.equal(fullRequestAfterReturn.body.data.request.items[0].fulfilledQty, 5);
    assert.equal(fullRequestAfterReturn.body.data.request.items[0].returnedQty, 5);

    const fullRepurchase = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-FULL-001/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'full-return-repurchase-key' },
      body: {
        branchId: branch._id,
        lines: [{ requestItemId: 'full-return-line', inventoryItemId: fullInventory._id, offeredQty: 5 }],
      },
    }, shopCookie);
    assert.equal(fullRepurchase.statusCode, 201);
    assert.equal((await InventoryItem.findById(fullInventory._id)).quantityReserved, 5);
    const fullRepurchaseFulfilment = await requestJson(server, `/api/v1/shop/orders/${fullRepurchase.body.data.order._id}/fulfil`, {
      method: 'POST',
    }, shopCookie);
    assert.equal(fullRepurchaseFulfilment.statusCode, 200);
    assert.equal(fullRepurchaseFulfilment.body.data.invoice.lines[0].quantity, 5);
    assert.equal((await InventoryItem.findById(fullInventory._id)).quantityOnHand, 0);
    const fullRequestAfterRepurchase = await requestJson(server, `/api/v1/requests/${fullRequest._id}`, {}, customerCookie);
    assert.equal(fullRequestAfterRepurchase.body.data.request.status, 'FULFILLED');
    assert.equal(fullRequestAfterRepurchase.body.data.request.items[0].fulfilledQty, 10);
    assert.equal(fullRequestAfterRepurchase.body.data.request.items[0].returnedQty, 5);
    assert.equal(await Invoice.countDocuments({ requestId: fullRequest._id, status: 'ISSUED' }), 2);
    assert.equal((await Invoice.findById(initialFullInvoiceId)).lines[0].quantity, 5);
    assert.equal((await ReturnRequest.find({ requestId: fullRequest._id })).length, 1);
    assert.equal(await InventoryMovement.countDocuments({ referenceId: fullReturn.body.data.returnRequest._id, movementType: 'RETURN_IN', quantity: 5 }), 1);

    const multiShopRequest = await MaterialRequest.create({
      requestCode: 'EL-RETURN-MULTI-001',
      electricianId: electrician._id,
      customerId: customer._id,
      houseId: house._id,
      shopAccess: { mode: 'ANY_REGISTERED_SHOP', approvedShopIds: [] },
      items: [{
        itemId: 'multi-shop-return-line',
        itemType: 'CUSTOM',
        name: 'Multi Shop Return Lamp',
        unit: 'PCS',
        requestedQty: 5,
      }],
    });
    const multiShopInventoryA = await InventoryItem.create({
      branchId: branch._id,
      sku: 'RETURN-MULTI-A',
      customName: 'Multi Shop Return Lamp',
      unit: 'PCS',
      quantityOnHand: 3,
      quantityReserved: 0,
      sellingPricePaise: 10000,
    });
    const multiShopInventoryB = await InventoryItem.create({
      branchId: secondBranch._id,
      sku: 'RETURN-MULTI-B',
      customName: 'Multi Shop Return Lamp',
      unit: 'PCS',
      quantityOnHand: 4,
      quantityReserved: 0,
      sellingPricePaise: 10000,
    });
    const firstShopOrder = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-MULTI-001/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'multi-return-shop-one-key' },
      body: {
        branchId: branch._id,
        lines: [{ requestItemId: 'multi-shop-return-line', inventoryItemId: multiShopInventoryA._id, offeredQty: 3 }],
      },
    }, shopCookie);
    assert.equal(firstShopOrder.statusCode, 201);
    const firstShopFulfilment = await requestJson(server, `/api/v1/shop/orders/${firstShopOrder.body.data.order._id}/fulfil`, {
      method: 'POST',
    }, shopCookie);
    assert.equal(firstShopFulfilment.statusCode, 200);

    const secondShopOrder = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-MULTI-001/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'multi-return-shop-two-key' },
      body: {
        branchId: secondBranch._id,
        lines: [{ requestItemId: 'multi-shop-return-line', inventoryItemId: multiShopInventoryB._id, offeredQty: 2 }],
      },
    }, secondShopCookie);
    assert.equal(secondShopOrder.statusCode, 201);
    const secondShopFulfilment = await requestJson(server, `/api/v1/shop/orders/${secondShopOrder.body.data.order._id}/fulfil`, {
      method: 'POST',
    }, secondShopCookie);
    assert.equal(secondShopFulfilment.statusCode, 200);

    const multiShopReturn = await requestJson(server, `/api/v1/requests/${multiShopRequest._id}/returns`, {
      method: 'POST',
      body: { orderId: firstShopOrder.body.data.order._id, lineIndex: 0, quantity: 2, reason: 'Return two items' },
    }, customerCookie);
    assert.equal(multiShopReturn.statusCode, 201);
    const multiShopReturnApproval = await requestJson(server, `/api/v1/shop/returns/${multiShopReturn.body.data.returnRequest._id}/decision`, {
      method: 'POST',
      body: { decision: 'APPROVE' },
    }, shopCookie);
    assert.equal(multiShopReturnApproval.statusCode, 200);
    assert.equal((await InventoryItem.findById(multiShopInventoryA._id)).quantityOnHand, 2);

    const secondShopLookup = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-MULTI-001', {}, secondShopCookie);
    assert.equal(secondShopLookup.statusCode, 200);
    assert.equal(secondShopLookup.body.data.items[0].remainingQty, 2);
    const secondShopRepurchase = await requestJson(server, '/api/v1/shop/requests/EL-RETURN-MULTI-001/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'multi-return-repurchase-key' },
      body: {
        branchId: secondBranch._id,
        lines: [{ requestItemId: 'multi-shop-return-line', inventoryItemId: multiShopInventoryB._id, offeredQty: 2 }],
      },
    }, secondShopCookie);
    assert.equal(secondShopRepurchase.statusCode, 201);
    const secondShopRepurchaseFulfilment = await requestJson(server, `/api/v1/shop/orders/${secondShopRepurchase.body.data.order._id}/fulfil`, {
      method: 'POST',
    }, secondShopCookie);
    assert.equal(secondShopRepurchaseFulfilment.statusCode, 200);
    assert.equal((await InventoryItem.findById(multiShopInventoryB._id)).quantityOnHand, 0);
    const multiShopRequestAfterRepurchase = await requestJson(server, `/api/v1/requests/${multiShopRequest._id}`, {}, customerCookie);
    assert.equal(multiShopRequestAfterRepurchase.body.data.request.status, 'FULFILLED');
    assert.equal(multiShopRequestAfterRepurchase.body.data.request.items[0].requestedQty, 5);
    assert.equal(multiShopRequestAfterRepurchase.body.data.request.items[0].fulfilledQty, 7);
    assert.equal(multiShopRequestAfterRepurchase.body.data.request.items[0].returnedQty, 2);
    assert.equal(await Invoice.countDocuments({ requestId: multiShopRequest._id, status: 'ISSUED' }), 3);
    assert.equal((await ReturnRequest.find({ requestId: multiShopRequest._id }))[0].status, 'APPROVED');
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});
