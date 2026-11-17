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
const { default: Product } = await import('../src/models/Product.js');
const { default: Customer } = await import('../src/models/Customer.js');

async function requestJson(server, path, options = {}, cookieHeader = '') {
  const response = await new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(options.headers || {}),
      },
    };

    const req = http.request(requestOptions, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body ? JSON.parse(body) : null,
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });

  return response;
}

async function requestBinary(server, path, options = {}, cookieHeader = '') {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method: options.method || 'GET',
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(options.headers || {}),
      },
    };

    const req = http.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function createTestServer() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  const memoryServer = await MongoMemoryServer.create({
    replSet: { count: 1 },
  });
  process.env.MONGODB_URI = memoryServer.getUri();
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return { memoryServer, server };
}

test('authenticated electrician workflow creates request and customer can view it', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const electricianRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Electrician One',
        phone: '9999000001',
        email: 'electrician1@example.com',
        password: 'StrongPass1!',
        role: 'ELECTRICIAN',
      },
    });

    assert.equal(electricianRegister.statusCode, 201);
    const electricianCookie = electricianRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const electricianLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'electrician1@example.com',
        password: 'StrongPass1!',
      },
    }, electricianCookie);

    assert.equal(electricianLogin.statusCode, 200);
    const electricianSessionCookie = electricianLogin.headers['set-cookie']?.[0]?.split(';')[0] || electricianCookie;

    const productResponse = await requestJson(server, '/api/v1/products', {
      method: 'POST',
      body: {
        sku: 'WIRE-001',
        name: 'Copper Wire',
        category: 'WIRING',
        brand: 'Finolex',
        unit: 'METRE',
        specifications: { gauge: '1.5 sq mm' },
      },
    }, electricianSessionCookie);

    assert.equal(productResponse.statusCode, 403);

    const customerRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Customer One',
        phone: '9999000002',
        email: 'customer1@example.com',
        password: 'StrongPass1!',
        role: 'CUSTOMER',
      },
    });

    assert.equal(customerRegister.statusCode, 201);
    const customerCookie = customerRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const customerCreateResponse = await requestJson(server, '/api/v1/customers', {
      method: 'POST',
      body: {
        name: 'Customer One',
        phone: '9999000002',
        email: 'customer1@example.com',
      },
    }, electricianSessionCookie);

    assert.equal(customerCreateResponse.statusCode, 201);
    const customerId = customerCreateResponse.body.data.customer._id;

    const houseResponse = await requestJson(server, '/api/v1/houses', {
      method: 'POST',
      body: {
        customerId,
        houseName: 'Main Villa',
        address: { city: 'Bengaluru', line1: '2nd Cross' },
      },
    }, electricianSessionCookie);

    assert.equal(houseResponse.statusCode, 201);
    const houseId = houseResponse.body.data.house._id;

    const requestResponse = await requestJson(server, '/api/v1/requests', {
      method: 'POST',
      body: {
        customerId,
        houseId,
        notes: 'Electrical rewiring',
        shopAccessMode: 'APPROVED_ONLY',
        items: [
          {
            itemType: 'CATALOG',
            productId: customerCreateResponse.body.data.customer._id,
            requestedQty: 10,
            brandPreference: 'Finolex',
            specifications: { gauge: '1.5 sq mm' },
          },
        ],
      },
    }, electricianSessionCookie);

    assert.equal(requestResponse.statusCode, 400);
    assert.match(requestResponse.body.message, /Catalog product not found/i);

    const productId = await (await import('../src/models/Product.js')).default.create({
      sku: 'WIRE-001',
      name: 'Copper Wire',
      category: 'WIRING',
      brand: 'Finolex',
      unit: 'METRE',
      specifications: { gauge: '1.5 sq mm' },
    });

    const validRequestResponse = await requestJson(server, '/api/v1/requests', {
      method: 'POST',
      body: {
        customerId,
        houseId,
        notes: 'Electrical rewiring',
        shopAccessMode: 'APPROVED_ONLY',
        items: [
          {
            itemType: 'CATALOG',
            productId: productId._id.toString(),
            requestedQty: 10,
            brandPreference: 'Finolex',
            specifications: { gauge: '1.5 sq mm' },
          },
        ],
      },
    }, electricianSessionCookie);

    assert.equal(validRequestResponse.statusCode, 201);
    const requestCode = validRequestResponse.body.data.request.requestCode;
    assert.match(requestCode, /^EL-/);

    const customerLinkUpdate = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'customer1@example.com',
        password: 'StrongPass1!',
      },
    }, customerCookie);

    assert.equal(customerLinkUpdate.statusCode, 200);
    const customerSessionCookie = customerLinkUpdate.headers['set-cookie']?.[0]?.split(';')[0] || customerCookie;

    const linkedCustomer = await (await import('../src/models/Customer.js')).default.findById(customerId);
    assert.equal(String(linkedCustomer.linkedUserId), customerLinkUpdate.body.data.user.id);

    const customerRequestLookUp = await requestJson(server, `/api/v1/requests/by-code/${requestCode}`, {}, customerSessionCookie);
    assert.equal(customerRequestLookUp.statusCode, 200);
    assert.equal(customerRequestLookUp.body.data.request.requestCode, requestCode);

    const meResponse = await requestJson(server, '/api/v1/auth/me', {}, customerSessionCookie);
    assert.equal(meResponse.statusCode, 200);
    assert.equal(meResponse.body.data.user.roles[0], 'CUSTOMER');
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('shop order flow reserves stock, fulfils the request, and creates an invoice', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const electricianRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Electrician Two',
        phone: '9999000003',
        email: 'electrician2@example.com',
        password: 'StrongPass1!',
        role: 'ELECTRICIAN',
      },
    });
    assert.equal(electricianRegister.statusCode, 201);
    const electricianCookie = electricianRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const electricianLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'electrician2@example.com',
        password: 'StrongPass1!',
      },
    }, electricianCookie);
    assert.equal(electricianLogin.statusCode, 200);
    const electricianSessionCookie = electricianLogin.headers['set-cookie']?.[0]?.split(';')[0] || electricianCookie;

    const customerRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Customer Two',
        phone: '9999000004',
        email: 'customer2@example.com',
        password: 'StrongPass1!',
        role: 'CUSTOMER',
      },
    });
    assert.equal(customerRegister.statusCode, 201);
    const customerCookie = customerRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const customerCreateResponse = await requestJson(server, '/api/v1/customers', {
      method: 'POST',
      body: {
        name: 'Customer Two',
        phone: '9999000004',
        email: 'customer2@example.com',
      },
    }, electricianSessionCookie);
    assert.equal(customerCreateResponse.statusCode, 201);
    const customerId = customerCreateResponse.body.data.customer._id;

    const houseResponse = await requestJson(server, '/api/v1/houses', {
      method: 'POST',
      body: {
        customerId,
        houseName: 'Lake View House',
        address: { city: 'Hyderabad', line1: '18th Street' },
      },
    }, electricianSessionCookie);
    assert.equal(houseResponse.statusCode, 201);
    const houseId = houseResponse.body.data.house._id;

    const product = await Product.create({
      sku: 'CABLE-100',
      name: 'PVC Insulated Cable',
      category: 'WIRING',
      brand: 'Polycab',
      unit: 'METRE',
      specifications: { gauge: '2.5 sq mm' },
    });

    const requestResponse = await requestJson(server, '/api/v1/requests', {
      method: 'POST',
      body: {
        customerId,
        houseId,
        notes: 'Cable replacement',
        shopAccessMode: 'ANY_REGISTERED_SHOP',
        items: [
          {
            itemType: 'CATALOG',
            productId: product._id.toString(),
            requestedQty: 20,
            brandPreference: 'Polycab',
            specifications: { gauge: '2.5 sq mm' },
          },
        ],
      },
    }, electricianSessionCookie);
    assert.equal(requestResponse.statusCode, 201);
    const requestCode = requestResponse.body.data.request.requestCode;

    const customerLinkUpdate = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'customer2@example.com',
        password: 'StrongPass1!',
      },
    }, customerCookie);
    assert.equal(customerLinkUpdate.statusCode, 200);
    const customerSessionCookie = customerLinkUpdate.headers['set-cookie']?.[0]?.split(';')[0] || customerCookie;
    const linkedCustomer = await Customer.findById(customerId);
    assert.equal(String(linkedCustomer.linkedUserId), customerLinkUpdate.body.data.user.id);

    const shopOwnerRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Shop Owner',
        phone: '9999000005',
        email: 'shopowner@example.com',
        password: 'StrongPass1!',
        role: 'SHOP_OWNER',
      },
    });
    assert.equal(shopOwnerRegister.statusCode, 201);
    const shopOwnerCookie = shopOwnerRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const shopOwnerLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'shopowner@example.com',
        password: 'StrongPass1!',
      },
    }, shopOwnerCookie);
    assert.equal(shopOwnerLogin.statusCode, 200);
    const shopSessionCookie = shopOwnerLogin.headers['set-cookie']?.[0]?.split(';')[0] || shopOwnerCookie;

    const shopProfileResponse = await requestJson(server, '/api/v1/shop/profile', {
      method: 'PUT',
      body: {
        businessName: 'FastFix Electricals',
        gstNumber: '29ABCDE1234F1Z5',
        contactPhone: '9876543210',
      },
    }, shopSessionCookie);
    assert.equal(shopProfileResponse.statusCode, 201);

    const shop = await (await import('../src/models/Shop.js')).default.findOneAndUpdate(
      { ownerUserId: shopOwnerLogin.body.data.user.id },
      { verificationStatus: 'VERIFIED' },
      { new: true },
    );
    assert.ok(shop);

    const branchResponse = await requestJson(server, '/api/v1/shop/branches', {
      method: 'POST',
      body: {
        branchName: 'Main Branch',
        phone: '9876543211',
        address: {
          line1: '22 Market Road',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
        },
      },
    }, shopSessionCookie);
    assert.equal(branchResponse.statusCode, 201);
    const branchId = branchResponse.body.data.branch._id;

    const inventoryResponse = await requestJson(server, '/api/v1/shop/inventory', {
      method: 'POST',
      body: {
        branchId,
        productId: product._id.toString(),
        sku: 'CABLE-100',
        unit: 'METRE',
        quantityOnHand: 100,
        sellingPricePaise: 2500,
        lowStockThreshold: 5,
      },
    }, shopSessionCookie);
    assert.equal(inventoryResponse.statusCode, 201);
    const inventoryId = inventoryResponse.body.data.item._id;

    const requestLookup = await requestJson(server, `/api/v1/shop/requests/${requestCode}`, {}, shopSessionCookie);
    assert.equal(requestLookup.statusCode, 200);

    const orderCreateResponse = await requestJson(server, `/api/v1/shop/requests/${requestCode}/orders`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'shop-order-001' },
      body: {
        branchId,
        lines: [
          {
            requestItemId: requestLookup.body.data.items[0].itemId,
            inventoryItemId: inventoryId,
            offeredQty: 20,
          },
        ],
      },
    }, shopSessionCookie);
    assert.equal(orderCreateResponse.statusCode, 201);
    const orderId = orderCreateResponse.body.data.order._id;

    const fulfilResponse = await requestJson(server, `/api/v1/shop/orders/${orderId}/fulfil`, {
      method: 'POST',
      body: {
        lines: [
          {
            requestItemId: requestLookup.body.data.items[0].itemId,
            quantity: 20,
          },
        ],
      },
    }, shopSessionCookie);
    assert.equal(fulfilResponse.statusCode, 200);
    assert.equal(fulfilResponse.body.data.order.status, 'FULFILLED');
    assert.equal(fulfilResponse.body.data.invoice.totalPaise, 50000);
    assert.equal(fulfilResponse.body.data.invoice.lines[0].quantity, 20);

    const customerRequest = await requestJson(server, `/api/v1/requests/by-code/${requestCode}`, {}, customerSessionCookie);
    assert.equal(customerRequest.statusCode, 200);
    assert.equal(customerRequest.body.data.request.status, 'FULFILLED');
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('customer approval lets a verified shop access an approved-only request', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const electricianRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Electrician Three',
        phone: '9999000006',
        email: 'electrician3@example.com',
        password: 'StrongPass1!',
        role: 'ELECTRICIAN',
      },
    });
    assert.equal(electricianRegister.statusCode, 201);
    const electricianCookie = electricianRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const electricianLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'electrician3@example.com',
        password: 'StrongPass1!',
      },
    }, electricianCookie);
    assert.equal(electricianLogin.statusCode, 200);
    const electricianSessionCookie = electricianLogin.headers['set-cookie']?.[0]?.split(';')[0] || electricianCookie;

    const customerRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Customer Three',
        phone: '9999000007',
        email: 'customer3@example.com',
        password: 'StrongPass1!',
        role: 'CUSTOMER',
      },
    });
    assert.equal(customerRegister.statusCode, 201);
    const customerCookie = customerRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const customerCreateResponse = await requestJson(server, '/api/v1/customers', {
      method: 'POST',
      body: {
        name: 'Customer Three',
        phone: '9999000007',
        email: 'customer3@example.com',
      },
    }, electricianSessionCookie);
    assert.equal(customerCreateResponse.statusCode, 201);
    const customerId = customerCreateResponse.body.data.customer._id;

    const houseResponse = await requestJson(server, '/api/v1/houses', {
      method: 'POST',
      body: {
        customerId,
        houseName: 'Sunset Villa',
        address: { city: 'Chennai', line1: '7th Lane' },
      },
    }, electricianSessionCookie);
    assert.equal(houseResponse.statusCode, 201);
    const houseId = houseResponse.body.data.house._id;

    const product = await Product.create({
      sku: 'SWITCH-120',
      name: 'Switch Module',
      category: 'LIGHTING',
      brand: 'Legrand',
      unit: 'PCS',
      specifications: { type: 'modular' },
    });

    const requestResponse = await requestJson(server, '/api/v1/requests', {
      method: 'POST',
      body: {
        customerId,
        houseId,
        notes: 'Lighting upgrade',
        shopAccessMode: 'APPROVED_ONLY',
        items: [
          {
            itemType: 'CATALOG',
            productId: product._id.toString(),
            requestedQty: 12,
            brandPreference: 'Legrand',
            specifications: { type: 'modular' },
          },
        ],
      },
    }, electricianSessionCookie);
    assert.equal(requestResponse.statusCode, 201);
    const requestId = requestResponse.body.data.request.id;
    const requestCode = requestResponse.body.data.request.requestCode;

    const customerLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'customer3@example.com',
        password: 'StrongPass1!',
      },
    }, customerCookie);
    assert.equal(customerLogin.statusCode, 200);
    const customerSessionCookie = customerLogin.headers['set-cookie']?.[0]?.split(';')[0] || customerCookie;
    const linkedCustomer = await Customer.findByIdAndUpdate(customerId, { linkedUserId: customerLogin.body.data.user.id }, { new: true });
    assert.ok(linkedCustomer);

    const shopOwnerRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Shop Owner Three',
        phone: '9999000008',
        email: 'shopowner3@example.com',
        password: 'StrongPass1!',
        role: 'SHOP_OWNER',
      },
    });
    assert.equal(shopOwnerRegister.statusCode, 201);
    const shopOwnerCookie = shopOwnerRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const shopOwnerLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'shopowner3@example.com',
        password: 'StrongPass1!',
      },
    }, shopOwnerCookie);
    assert.equal(shopOwnerLogin.statusCode, 200);
    const shopSessionCookie = shopOwnerLogin.headers['set-cookie']?.[0]?.split(';')[0] || shopOwnerCookie;

    const shopProfileResponse = await requestJson(server, '/api/v1/shop/profile', {
      method: 'PUT',
      body: {
        businessName: 'BlueLine Electricals',
        gstNumber: '33ABCDE1234F1Z5',
        contactPhone: '9000001122',
      },
    }, shopSessionCookie);
    assert.equal(shopProfileResponse.statusCode, 201);

    const shop = await (await import('../src/models/Shop.js')).default.findOneAndUpdate(
      { ownerUserId: shopOwnerLogin.body.data.user.id },
      { verificationStatus: 'VERIFIED' },
      { new: true },
    );
    assert.ok(shop);

    const accessRequestResponse = await requestJson(server, `/api/v1/shop/requests/${requestCode}/access-request`, {
      method: 'POST',
    }, shopSessionCookie);
    assert.equal(accessRequestResponse.statusCode, 201);

    const pendingAccess = await requestJson(server, `/api/v1/requests/${requestId}/shop-access-requests`, {}, customerSessionCookie);
    assert.equal(pendingAccess.statusCode, 200);
    assert.equal(pendingAccess.body.data.requests.length, 1);

    const approveResponse = await requestJson(server, `/api/v1/requests/${requestId}/shop-access/${shop._id}/decision`, {
      method: 'POST',
      body: { decision: 'APPROVE' },
    }, customerSessionCookie);
    assert.equal(approveResponse.statusCode, 200);

    const lookupAfterApproval = await requestJson(server, `/api/v1/shop/requests/${requestCode}`, {}, shopSessionCookie);
    assert.equal(lookupAfterApproval.statusCode, 200);
    assert.equal(lookupAfterApproval.body.data.request.requestCode, requestCode);

    const revokeResponse = await requestJson(server, `/api/v1/requests/${requestId}/shop-access/${shop._id}`, {
      method: 'DELETE',
    }, customerSessionCookie);
    assert.equal(revokeResponse.statusCode, 200);

    const lookupAfterRevoke = await requestJson(server, `/api/v1/shop/requests/${requestCode}`, {}, shopSessionCookie);
    assert.equal(lookupAfterRevoke.statusCode, 403);
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('public QR access returns the request without exposing private customer data', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const electricianRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Electrician Four',
        phone: '9999000010',
        email: 'electrician4@example.com',
        password: 'StrongPass1!',
        role: 'ELECTRICIAN',
      },
    });
    assert.equal(electricianRegister.statusCode, 201);
    const electricianCookie = electricianRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const electricianLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'electrician4@example.com',
        password: 'StrongPass1!',
      },
    }, electricianCookie);
    assert.equal(electricianLogin.statusCode, 200);
    const electricianSessionCookie = electricianLogin.headers['set-cookie']?.[0]?.split(';')[0] || electricianCookie;

    const customerRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Customer Four',
        phone: '9999000011',
        email: 'customer4@example.com',
        password: 'StrongPass1!',
        role: 'CUSTOMER',
      },
    });
    assert.equal(customerRegister.statusCode, 201);

    const customerCreateResponse = await requestJson(server, '/api/v1/customers', {
      method: 'POST',
      body: {
        name: 'Customer Four',
        phone: '9999000011',
        email: 'customer4@example.com',
      },
    }, electricianSessionCookie);
    assert.equal(customerCreateResponse.statusCode, 201);
    const customerId = customerCreateResponse.body.data.customer._id;

    const houseResponse = await requestJson(server, '/api/v1/houses', {
      method: 'POST',
      body: {
        customerId,
        houseName: 'Riverside House',
        address: { city: 'Bengaluru', line1: '12 Main Road' },
      },
    }, electricianSessionCookie);
    assert.equal(houseResponse.statusCode, 201);
    const houseId = houseResponse.body.data.house._id;

    const product = await Product.create({
      sku: 'FAN-24',
      name: 'Ceiling Fan',
      category: 'LIGHTING',
      brand: 'Atomberg',
      unit: 'PCS',
      specifications: { sweep: '1200mm' },
    });

    const requestResponse = await requestJson(server, '/api/v1/requests', {
      method: 'POST',
      body: {
        customerId,
        houseId,
        notes: 'Living room fan replacement',
        shopAccessMode: 'APPROVED_ONLY',
        items: [{
          itemType: 'CATALOG',
          productId: product._id.toString(),
          requestedQty: 6,
          brandPreference: 'Atomberg',
          specifications: { sweep: '1200mm' },
        }],
      },
    }, electricianSessionCookie);
    assert.equal(requestResponse.statusCode, 201);
    const requestId = requestResponse.body.data.request.id;

    const qrResponse = await requestJson(server, `/api/v1/requests/${requestId}/customer-qr`, {
      method: 'POST',
    }, electricianSessionCookie);
    assert.equal(qrResponse.statusCode, 201);
    const qrToken = qrResponse.body.data.accessUrl.split('/access/')[1];
    assert.ok(qrToken);

    const publicResponse = await requestJson(server, `/api/v1/requests/public/access/${qrToken}`);
    assert.equal(publicResponse.statusCode, 200);
    assert.equal(publicResponse.body.data.request.requestCode, requestResponse.body.data.request.requestCode);
    assert.equal(publicResponse.body.data.request.items.length, 1);
    assert.equal(publicResponse.body.data.request.customerEmail, undefined);
    assert.equal(publicResponse.body.data.request.customerPhone, undefined);
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('shop owner can download a PDF invoice for their own issued invoice', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const shopOwnerRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Shop Owner Four',
        phone: '9999000012',
        email: 'shopowner4@example.com',
        password: 'StrongPass1!',
        role: 'SHOP_OWNER',
      },
    });
    assert.equal(shopOwnerRegister.statusCode, 201);
    const shopOwnerCookie = shopOwnerRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const shopOwnerLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'shopowner4@example.com',
        password: 'StrongPass1!',
      },
    }, shopOwnerCookie);
    assert.equal(shopOwnerLogin.statusCode, 200);
    const shopOwnerSessionCookie = shopOwnerLogin.headers['set-cookie']?.[0]?.split(';')[0] || shopOwnerCookie;

    const shop = await (await import('../src/models/Shop.js')).default.create({
      ownerUserId: shopOwnerLogin.body.data.user.id,
      businessName: 'Northstar Supply',
      gstNumber: '29ABCDE1234F1Z2',
      contactPhone: '9000003322',
      verificationStatus: 'VERIFIED',
    });

    const invoice = await (await import('../src/models/Invoice.js')).default.create({
      invoiceNumber: 'INV-TEST-001',
      requestId: new mongoose.Types.ObjectId(),
      orderId: new mongoose.Types.ObjectId(),
      shopId: shop._id,
      branchId: new mongoose.Types.ObjectId(),
      customerId: new mongoose.Types.ObjectId(),
      sellerSnapshot: { businessName: shop.businessName, gstNumber: shop.gstNumber, contactPhone: shop.contactPhone },
      buyerSnapshot: { name: 'Test Buyer', phone: '8888888888', email: 'buyer@example.com' },
      lines: [{
        requestItemId: 'line-1',
        itemName: 'Ceiling Fan',
        quantity: 2,
        unit: 'PCS',
        unitPricePaise: 15000,
        lineTotalPaise: 30000,
      }],
      subtotalPaise: 30000,
      taxPaise: 3000,
      totalPaise: 33000,
      status: 'ISSUED',
      issuedAt: new Date(),
    });

    const pdfResponse = await requestBinary(server, `/api/v1/invoices/${invoice._id}/pdf`, {}, shopOwnerSessionCookie);
    assert.equal(pdfResponse.statusCode, 200);
    assert.match(pdfResponse.headers['content-type'], /application\/pdf/);
    assert.ok(pdfResponse.body.length > 1000);
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('voiding an invoice creates a credit note record for the correction workflow', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const shopOwnerRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Shop Owner Correction',
        phone: '9999000017',
        email: 'shopowner-correction@example.com',
        password: 'StrongPass1!',
        role: 'SHOP_OWNER',
      },
    });
    assert.equal(shopOwnerRegister.statusCode, 201);
    const shopOwnerCookie = shopOwnerRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const shopOwnerLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'shopowner-correction@example.com',
        password: 'StrongPass1!',
      },
    }, shopOwnerCookie);
    assert.equal(shopOwnerLogin.statusCode, 200);
    const shopOwnerSessionCookie = shopOwnerLogin.headers['set-cookie']?.[0]?.split(';')[0] || shopOwnerCookie;

    const shop = await (await import('../src/models/Shop.js')).default.create({
      ownerUserId: shopOwnerLogin.body.data.user.id,
      businessName: 'Correction Supply',
      gstNumber: '29ABCDE1234F1Z3',
      contactPhone: '9000003399',
      verificationStatus: 'VERIFIED',
    });

    const invoice = await (await import('../src/models/Invoice.js')).default.create({
      invoiceNumber: 'INV-VOID-001',
      requestId: new mongoose.Types.ObjectId(),
      orderId: new mongoose.Types.ObjectId(),
      shopId: shop._id,
      branchId: new mongoose.Types.ObjectId(),
      customerId: new mongoose.Types.ObjectId(),
      sellerSnapshot: { businessName: shop.businessName },
      buyerSnapshot: { name: 'Corrected Buyer', phone: '8888888888', email: 'buyer@example.com' },
      lines: [{ requestItemId: 'line-correction', itemName: 'LED Downlight', quantity: 1, unit: 'PCS', unitPricePaise: 12000, lineTotalPaise: 12000 }],
      subtotalPaise: 12000,
      taxPaise: 1200,
      totalPaise: 13200,
      status: 'ISSUED',
      issuedAt: new Date(),
    });

    const voidResponse = await requestJson(server, `/api/v1/invoices/${invoice._id}/void`, { method: 'POST' }, shopOwnerSessionCookie);
    assert.equal(voidResponse.statusCode, 200);
    assert.equal(voidResponse.body.data.invoice.status, 'VOID');

    const creditResponse = await requestJson(server, `/api/v1/invoices/${invoice._id}/credit-note`, {}, shopOwnerSessionCookie);
    assert.equal(creditResponse.statusCode, 200);
    assert.equal(creditResponse.body.data.creditNote.sourceInvoiceId, invoice._id.toString());
    assert.equal(creditResponse.body.data.creditNote.totalPaise, invoice.totalPaise);
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('super admin user status guard rails block self-deactivation and allow safe admin changes', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const User = (await import('../src/models/User.js')).default;
    const primaryAdmin = await User.create({
      name: 'Primary Admin',
      phone: '9999000013',
      email: 'primary-admin@example.com',
      passwordHash: await User.hashPassword('StrongPass1!'),
      roles: ['ADMIN'],
      accountStatus: 'ACTIVE',
    });
    const backupAdmin = await User.create({
      name: 'Backup Admin',
      phone: '9999000014',
      email: 'backup-admin@example.com',
      passwordHash: await User.hashPassword('StrongPass1!'),
      roles: ['ADMIN'],
      accountStatus: 'ACTIVE',
    });

    const primaryLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'primary-admin@example.com',
        password: 'StrongPass1!',
      },
    });
    assert.equal(primaryLogin.statusCode, 200);
    const primaryCookie = primaryLogin.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const selfSuspend = await requestJson(server, `/api/v1/admin/users/${primaryAdmin._id}/status`, {
      method: 'PATCH',
      body: { status: 'SUSPENDED' },
    }, primaryCookie);
    assert.equal(selfSuspend.statusCode, 400);
    assert.match(String(selfSuspend.body.message), /deactivate your own/i);

    const suspendBackup = await requestJson(server, `/api/v1/admin/users/${backupAdmin._id}/status`, {
      method: 'PATCH',
      body: { status: 'SUSPENDED' },
    }, primaryCookie);
    assert.equal(suspendBackup.statusCode, 200);
    assert.equal(suspendBackup.body.data.user.accountStatus, 'SUSPENDED');
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('customer notifications are created and can be marked as read through the authenticated API', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const electricianRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Electrician Five',
        phone: '9999000015',
        email: 'electrician5@example.com',
        password: 'StrongPass1!',
        role: 'ELECTRICIAN',
      },
    });
    assert.equal(electricianRegister.statusCode, 201);
    const electricianCookie = electricianRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const electricianLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'electrician5@example.com',
        password: 'StrongPass1!',
      },
    }, electricianCookie);
    assert.equal(electricianLogin.statusCode, 200);
    const electricianSessionCookie = electricianLogin.headers['set-cookie']?.[0]?.split(';')[0] || electricianCookie;

    const customerRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Customer Five',
        phone: '9999000016',
        email: 'customer5@example.com',
        password: 'StrongPass1!',
        role: 'CUSTOMER',
      },
    });
    assert.equal(customerRegister.statusCode, 201);
    const customerCookie = customerRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const customerLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'customer5@example.com',
        password: 'StrongPass1!',
      },
    }, customerCookie);
    assert.equal(customerLogin.statusCode, 200);
    const customerSessionCookie = customerLogin.headers['set-cookie']?.[0]?.split(';')[0] || customerCookie;

    const customer = await (await import('../src/models/Customer.js')).default.create({
      createdByElectricianId: electricianLogin.body.data.user.id,
      name: 'Customer Five',
      phone: '9999000016',
      email: 'customer5@example.com',
      linkedUserId: customerLogin.body.data.user.id,
    });
    const house = await (await import('../src/models/House.js')).default.create({
      customerId: customer._id,
      createdByElectricianId: electricianLogin.body.data.user.id,
      houseName: 'Lakeview Residence',
      address: { city: 'Bengaluru', line1: '15 Lake Road' },
    });
    const product = await (await import('../src/models/Product.js')).default.create({
      sku: 'LAMP-001',
      name: 'LED Bulkhead',
      category: 'LIGHTING',
      brand: 'Philips',
      unit: 'PCS',
      specifications: { wattage: '12W' },
    });

    const requestResponse = await requestJson(server, '/api/v1/requests', {
      method: 'POST',
      body: {
        customerId: customer._id,
        houseId: house._id,
        notes: 'Lighting upgrade',
        shopAccessMode: 'APPROVED_ONLY',
        items: [{
          itemType: 'CATALOG',
          productId: product._id.toString(),
          requestedQty: 8,
          brandPreference: 'Philips',
          specifications: { wattage: '12W' },
        }],
      },
    }, electricianSessionCookie);
    assert.equal(requestResponse.statusCode, 201);
    const requestId = requestResponse.body.data.request.id;

    const shop = await (await import('../src/models/Shop.js')).default.create({
      ownerUserId: (await (await import('../src/models/User.js')).default.create({
        name: 'Shop Owner Five',
        phone: '9999000017',
        email: 'shopowner5@example.com',
        passwordHash: await (await import('../src/models/User.js')).default.hashPassword('StrongPass1!'),
        roles: ['SHOP_OWNER'],
        accountStatus: 'ACTIVE',
      }))._id,
      businessName: 'Quantum Electrics',
      gstNumber: '29ABCDE1234F1Z3',
      contactPhone: '9000003323',
      verificationStatus: 'VERIFIED',
    });

    const shopRequest = await requestJson(server, `/api/v1/shop/requests/${requestResponse.body.data.request.requestCode}/access-request`, {
      method: 'POST',
    }, (await requestJson(server, '/api/v1/auth/login', { method: 'POST', body: { identifier: 'shopowner5@example.com', password: 'StrongPass1!' } })).headers['set-cookie']?.[0]?.split(';')[0] || '');
    assert.equal(shopRequest.statusCode, 201);

    const notifications = await requestJson(server, '/api/v1/notifications', {}, customerSessionCookie);
    assert.equal(notifications.statusCode, 200);
    assert.ok(Array.isArray(notifications.body.data.notifications));
    assert.ok(notifications.body.data.notifications.some((entry) => entry.type === 'SHOP_ACCESS_REQUESTED'));

    const unread = notifications.body.data.notifications.find((entry) => entry.type === 'SHOP_ACCESS_REQUESTED');
    assert.ok(unread);
    const markRead = await requestJson(server, `/api/v1/notifications/${unread._id}/read`, {
      method: 'PATCH',
    }, customerSessionCookie);
    assert.equal(markRead.statusCode, 200);
    assert.equal(markRead.body.data.notification.isRead, true);
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('unverified shop owners cannot cancel accepted orders', { concurrency: false }, async () => {
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

    const shopOwner = await User.create({
      name: 'Pending Shop Owner',
      phone: '9999000018',
      email: 'pendingshop@example.com',
      passwordHash: await User.hashPassword('StrongPass1!'),
      roles: ['SHOP_OWNER'],
      accountStatus: 'ACTIVE',
    });

    const login = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: 'pendingshop@example.com',
        password: 'StrongPass1!',
      },
    });
    assert.equal(login.statusCode, 200);
    const shopOwnerCookie = login.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const shop = await Shop.create({
      ownerUserId: shopOwner._id,
      businessName: 'Pending Electrics',
      gstNumber: '29ABCDE1234F1Z4',
      contactPhone: '9000003324',
      verificationStatus: 'PENDING',
      isActive: true,
    });

    const customer = await Customer.create({
      createdByElectricianId: shopOwner._id,
      name: 'Order Customer',
      phone: '9999000019',
      email: 'ordercustomer@example.com',
    });
    const house = await House.create({
      customerId: customer._id,
      createdByElectricianId: shopOwner._id,
      houseName: 'Pending Address',
      address: { city: 'Bengaluru', line1: '36 Market Road' },
    });
    const branch = await ShopBranch.create({
      shopId: shop._id,
      branchName: 'Main Branch',
      phone: '9000003325',
      address: { line1: '1st Cross', city: 'Bengaluru' },
    });
    const inventoryItem = await InventoryItem.create({
      branchId: branch._id,
      productId: null,
      sku: 'SW-01',
      customName: 'Switch Board',
      unit: 'PCS',
      quantityOnHand: 10,
      sellingPricePaise: 20000,
      quantityReserved: 0,
      lowStockThreshold: 1,
    });

    const request = await MaterialRequest.create({
      requestCode: 'EL-UNVERIFIED-CANCEL',
      electricianId: shopOwner._id,
      customerId: customer._id,
      houseId: house._id,
      status: 'OPEN',
      items: [{
        itemId: 'item-1',
        itemType: 'CUSTOM',
        name: 'Switch Board',
        category: 'ELECTRICAL',
        unit: 'PCS',
        requestedQty: 4,
        specifications: {},
      }],
      shopAccess: { mode: 'ANY_REGISTERED_SHOP', approvedShopIds: [] },
    });

    const order = await ShopOrder.create({
      orderCode: 'OR-UNVERIFIED-ORDER',
      idempotencyKey: 'order-key-1',
      requestId: request._id,
      shopId: shop._id,
      branchId: branch._id,
      customerId: customer._id,
      createdByShopUserId: shopOwner._id,
      status: 'ACCEPTED',
      lines: [{
        requestItemId: 'item-1',
        inventoryItemId: inventoryItem._id,
        productId: null,
        itemNameSnapshot: 'Switch Board',
        unit: 'PCS',
        offeredQty: 4,
        approvedQty: 4,
        fulfilledQty: 0,
        unitPricePaise: 20000,
      }],
      subtotalPaise: 80000,
      taxPaise: 8000,
      totalPaise: 88000,
      acceptedAt: new Date(),
    });

    const response = await requestJson(server, `/api/v1/shop/orders/${order._id}/cancel`, { method: 'POST' }, shopOwnerCookie);
    assert.equal(response.statusCode, 403);
    assert.match(String(response.body.message), /verified/i);
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('request lookup accepts request codes with or without the EL- prefix', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const electricianRegister = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Electrician Prefix',
        phone: '9999000051',
        email: 'electrician-prefix@example.com',
        password: 'StrongPass1!',
        role: 'ELECTRICIAN',
      },
    });
    const electricianCookie = electricianRegister.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const CustomerModel = (await import('../src/models/Customer.js')).default;
    const HouseModel = (await import('../src/models/House.js')).default;
    const UserModel = (await import('../src/models/User.js')).default;

    const uniqueSuffix = String(Date.now()).slice(-8);
    const customerUser = await UserModel.create({
      name: 'Customer Prefix User',
      phone: `99990000${uniqueSuffix}`,
      email: `customer-prefix-${uniqueSuffix}@example.com`,
      passwordHash: await UserModel.hashPassword('StrongPass1!'),
      roles: ['CUSTOMER'],
      accountStatus: 'ACTIVE',
    });
    const customerLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: customerUser.email,
        password: 'StrongPass1!',
      },
    });
    const customerSessionCookie = customerLogin.headers['set-cookie']?.[0]?.split(';')[0] || '';

    const customer = await CustomerModel.create({
      createdByElectricianId: electricianRegister.body.data.user.id,
      name: 'Alpha Customer',
      phone: customerUser.phone,
      email: 'alpha@example.com',
      linkedUserId: customerUser._id,
    });

    const house = await HouseModel.create({
      customerId: customer._id,
      createdByElectricianId: electricianRegister.body.data.user.id,
      houseName: 'Main House',
      address: { line1: '1 Main', city: 'Hub' },
    });

    const requestResponse = await requestJson(server, '/api/v1/requests', {
      method: 'POST',
      body: {
        customerId: customer._id,
        houseId: house._id,
        items: [{ itemType: 'CUSTOM', name: 'Switch Board', category: 'ELECTRICAL', unit: 'PCS', requestedQty: 2, brandPreference: 'Generic' }],
      },
    }, electricianCookie);

    assert.equal(requestResponse.statusCode, 201);
    const requestCode = requestResponse.body.data.request.requestCode;

    const lookupWithoutPrefix = await requestJson(server, `/api/v1/requests/by-code/${encodeURIComponent(requestCode.replace(/^EL-/, ''))}`, {}, customerSessionCookie);
    const lookupWithPrefix = await requestJson(server, `/api/v1/requests/by-code/${encodeURIComponent(requestCode)}`, {}, customerSessionCookie);

    assert.equal(lookupWithoutPrefix.statusCode, 200);
    assert.equal(lookupWithoutPrefix.body.data.request.requestCode, requestCode);
    assert.equal(lookupWithPrefix.statusCode, 200);
    assert.equal(lookupWithPrefix.body.data.request.requestCode, requestCode);
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});

test('admin reports summarize recent sales and material-request activity', { concurrency: false }, async () => {
  const { memoryServer, server } = await createTestServer();

  try {
    const User = (await import('../src/models/User.js')).default;
    const adminUser = await User.create({
      name: 'Admin Reports',
      email: 'admin-report@example.com',
      phone: '9999000123',
      passwordHash: await User.hashPassword('StrongPass1!'),
      roles: ['ADMIN'],
      accountStatus: 'ACTIVE',
    });

    const jwt = await import('jsonwebtoken');
    const { env } = await import('../src/config/env.js');
    const token = jwt.default.sign({ sub: adminUser._id.toString(), roles: adminUser.roles }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
    const adminCookie = `${env.cookieName}=${token}`;

    const Customer = (await import('../src/models/Customer.js')).default;
    const customer = await Customer.create({
      createdByElectricianId: adminUser._id,
      name: 'Report Customer',
      phone: '9999000124',
      email: 'reportcustomer@example.com',
    });

    const House = (await import('../src/models/House.js')).default;
    const house = await House.create({
      customerId: customer._id,
      createdByElectricianId: adminUser._id,
      houseName: 'Report House',
      address: { line1: '44 Ledger Street', city: 'Bengaluru' },
    });

    const requestModel = (await import('../src/models/MaterialRequest.js')).default;
    const request = await requestModel.create({
      requestCode: 'EL-REPORT-001',
      electricianId: adminUser._id,
      customerId: customer._id,
      houseId: house._id,
      status: 'OPEN',
      items: [{ itemType: 'CUSTOM', name: 'LED Panel', category: 'LIGHTING', unit: 'PCS', requestedQty: 2, brandPreference: 'Philips' }],
    });

    const Invoice = (await import('../src/models/Invoice.js')).default;
    await Invoice.create({
      invoiceNumber: 'INV-REPORT-001',
      requestId: request._id,
      orderId: new mongoose.Types.ObjectId(),
      shopId: new mongoose.Types.ObjectId(),
      branchId: new mongoose.Types.ObjectId(),
      customerId: customer._id,
      sellerSnapshot: { businessName: 'Report Shop' },
      buyerSnapshot: { name: 'Report Customer' },
      lines: [{ requestItemId: request.items[0].itemId, itemName: 'LED Panel', quantity: 2, unit: 'PCS', unitPricePaise: 25000, lineTotalPaise: 50000 }],
      subtotalPaise: 50000,
      taxPaise: 5000,
      discountPaise: 0,
      totalPaise: 55000,
      status: 'ISSUED',
      issuedAt: new Date(),
    });

    const response = await requestJson(server, '/api/v1/admin/reports?days=30', {}, adminCookie);
    assert.equal(response.statusCode, 200);
    assert.ok(Array.isArray(response.body.data.report.salesByDay));
    assert.ok(Array.isArray(response.body.data.report.requestStatusBreakdown));
    assert.ok(response.body.data.report.totalSalesPaise >= 55000);
  } finally {
    await mongoose.disconnect();
    await server.close();
    await memoryServer.stop();
  }
});
