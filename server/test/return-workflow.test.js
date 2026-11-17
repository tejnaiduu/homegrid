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
    const inventory = await InventoryItem.create({
      branchId: branch._id,
      sku: 'RETURN-TEST-ITEM',
      customName: 'Return Test Lamp',
      unit: 'PCS',
      quantityOnHand: 5,
      quantityReserved: 0,
      sellingPricePaise: 10000,
    });
    const request = await MaterialRequest.create({
      requestCode: 'EL-RETURN-FLOW-001',
      electricianId: electrician._id,
      customerId: customer._id,
      houseId: house._id,
      status: 'FULFILLED',
      items: [{
        itemId: 'return-test-line',
        itemType: 'CUSTOM',
        name: 'Return Test Lamp',
        unit: 'PCS',
        requestedQty: 4,
        fulfilledQty: 4,
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
        offeredQty: 4,
        approvedQty: 4,
        fulfilledQty: 4,
        unitPricePaise: 10000,
      }],
      subtotalPaise: 40000,
      totalPaise: 40000,
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
      lines: [{ requestItemId: 'return-test-line', itemName: 'Return Test Lamp', quantity: 4, unit: 'PCS', unitPricePaise: 10000, lineTotalPaise: 40000 }],
      subtotalPaise: 40000,
      totalPaise: 40000,
    });

    const createReturn = await requestJson(server, `/api/v1/requests/${request._id}/returns`, {
      method: 'POST',
      body: { orderId: order._id, lineIndex: 0, quantity: 1, reason: 'Item not needed' },
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

    const approval = await requestJson(server, `/api/v1/shop/returns/${createReturn.body.data.returnRequest._id}/decision`, {
      method: 'POST',
      body: { decision: 'APPROVE' },
    }, shopCookie);
    assert.equal(approval.statusCode, 200);
    assert.equal(approval.body.data.returnRequest.status, 'APPROVED');
    assert.equal((await InventoryItem.findById(inventory._id)).quantityOnHand, 6);
    assert.equal(await InventoryMovement.countDocuments({ referenceId: createReturn.body.data.returnRequest._id, movementType: 'RETURN_IN', quantity: 1 }), 1);

    const duplicateApproval = await requestJson(server, `/api/v1/shop/returns/${createReturn.body.data.returnRequest._id}/decision`, {
      method: 'POST',
      body: { decision: 'APPROVE' },
    }, shopCookie);
    assert.equal(duplicateApproval.statusCode, 409);
    assert.equal((await InventoryItem.findById(inventory._id)).quantityOnHand, 6);

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
    assert.equal((await InventoryItem.findById(inventory._id)).quantityOnHand, 6);

    const updatedOrder = await ShopOrder.findById(order._id);
    assert.equal(updatedOrder.lines[0].returnApprovedQty, 1);
    assert.equal(updatedOrder.lines[0].returnPendingQty, 0);
    assert.equal(await CreditNote.countDocuments({ orderId: order._id }), 0);
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});
