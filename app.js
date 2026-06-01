const loadSheetBtn = document.getElementById('loadSheetBtn');
const rerollBtn = document.getElementById('rerollBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusEl = document.getElementById('status');
const productCountEl = document.getElementById('productCount');
const variantCountEl = document.getElementById('variantCount');
const totalProductCountEl = document.getElementById('totalProductCount');
const previewBody = document.getElementById('previewBody');
const historyBody = document.getElementById('historyBody');

const groupInputs = [
  {
    from: document.getElementById('group1From'),
    to: document.getElementById('group1To'),
    count: document.getElementById('group1Count')
  },
  {
    from: document.getElementById('group2From'),
    to: document.getElementById('group2To'),
    count: document.getElementById('group2Count')
  },
  {
    from: document.getElementById('group3From'),
    to: document.getElementById('group3To'),
    count: document.getElementById('group3Count')
  }
];

let parsedProducts = [];
let outputRows = [];
let currentSelectedProductIds = [];
let currentSelectedProducts = [];

const GOOGLE_SHEET_ID = '1Pi__I2Uwd3OTGp7ff8Ju6qC0oQHidTZMu11ljZbNPM4';
const GOOGLE_SHEET_GID = '1099495700';
const DOWNLOAD_HISTORY_KEY = 'flashSaleRecentDownloadedProductIds';
const MAX_DOWNLOAD_HISTORY = 5;
const MAX_ALLOWED_DUPLICATES = 2;
const MAX_RANDOM_ATTEMPTS = 500;

loadSheetBtn.addEventListener('click', handleGoogleSheet);
rerollBtn.addEventListener('click', () => {
  try {
    generateResult();
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi: ${error.message}`, 'error');
  }
});
downloadBtn.addEventListener('click', downloadFlashSale);
renderDownloadHistory();

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : 'status';
}

function resetResult() {
  outputRows = [];
  parsedProducts = [];
  currentSelectedProductIds = [];
  currentSelectedProducts = [];
  rerollBtn.disabled = true;
  downloadBtn.disabled = true;
  productCountEl.textContent = '0';
  variantCountEl.textContent = '0';
  totalProductCountEl.textContent = '0';
  previewBody.innerHTML = '<tr><td colspan="4">Chưa có dữ liệu.</td></tr>';
}

async function handleGoogleSheet() {
  resetResult();

  try {
    setStatus('Đang lấy dữ liệu từ Google Sheet...', '');
    loadSheetBtn.disabled = true;

    const rows = await loadGoogleSheetRows();
    parsedProducts = parsePivotRows(rows);
    rerollBtn.disabled = false;
    generateResult('Đã lấy dữ liệu từ Google Sheet.');
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi: ${error.message}`, 'error');
  } finally {
    loadSheetBtn.disabled = false;
  }
}

function loadGoogleSheetRows() {
  return new Promise((resolve, reject) => {
    const callbackName = `googleSheetCallback_${Date.now()}`;
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Google Sheet phản hồi quá lâu. Kiểm tra kết nối mạng hoặc quyền share của sheet.'));
    }, 20000);

    window[callbackName] = response => {
      cleanup();

      try {
        if (!response || response.status === 'error') {
          const message = response && response.errors && response.errors[0]
            ? response.errors[0].detailed_message || response.errors[0].message
            : 'Không đọc được dữ liệu Google Sheet.';
          reject(new Error(message));
          return;
        }

        resolve(convertGoogleTableToRows(response.table));
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Không tải được Google Sheet. Sheet cần được share "Anyone with the link can view".'));
    };

    const query = new URLSearchParams({
      gid: GOOGLE_SHEET_GID,
      tqx: `out:json;responseHandler:${callbackName}`
    });
    script.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?${query.toString()}`;
    document.body.appendChild(script);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
  });
}

function convertGoogleTableToRows(table) {
  if (!table || !Array.isArray(table.rows)) {
    throw new Error('Dữ liệu Google Sheet không đúng định dạng.');
  }

  const header = table.cols.map(col => cleanCell(col.label || col.id));
  const body = table.rows.map(row =>
    table.cols.map((_, index) => {
      const cell = row.c && row.c[index];
      if (!cell) return '';
      return cleanCell(cell.f || cell.v);
    })
  );

  return [header, ...body];
}

function generateResult(prefixMessage = 'Đã random lại kết quả.') {
  outputRows = [];
  currentSelectedProductIds = [];
  currentSelectedProducts = [];
  downloadBtn.disabled = true;
  productCountEl.textContent = '0';
  variantCountEl.textContent = '0';
  previewBody.innerHTML = '<tr><td colspan="4">Đang random kết quả...</td></tr>';

  if (!parsedProducts.length) {
    setStatus('Chưa có file Excel hợp lệ.', 'error');
    return;
  }

  const groups = readGroups();
  const selectedProducts = generateUniqueSelection(groups);
  currentSelectedProducts = selectedProducts;
  currentSelectedProductIds = selectedProducts.map(product => product.productId);

  outputRows = selectedProducts.flatMap(product =>
    product.variants.map(variant => ({
      'Mã sản phẩm': product.productId,
      'Mã phân loại hàng': variant.variantId,
      'Giá đã giảm': variant.price
    }))
  );

  renderSummary(parsedProducts, selectedProducts, outputRows);

  if (!outputRows.length) {
    setStatus('Không tìm thấy dòng phân loại có giá bán để xuất.', 'error');
    return;
  }

  downloadBtn.disabled = false;
  setStatus(`${prefixMessage} Bấm tải để xuất file.`, 'ok');
}

function generateUniqueSelection(groups) {
  let bestSelection = [];
  let bestDuplicateCount = Infinity;

  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
    const selectedProducts = selectProductsForGroups(groups);
    const duplicateCount = getMaxHistoryDuplicateCount(selectedProducts.map(product => product.productId));

    if (duplicateCount < bestDuplicateCount) {
      bestSelection = selectedProducts;
      bestDuplicateCount = duplicateCount;
    }

    if (duplicateCount <= MAX_ALLOWED_DUPLICATES) {
      return selectedProducts;
    }
  }

  if (bestDuplicateCount === Infinity) {
    return bestSelection;
  }

  throw new Error(`Không random được bộ mới trùng tối đa ${MAX_ALLOWED_DUPLICATES} sản phẩm với 5 lần tải gần nhất. Hãy giảm số lượng lấy hoặc đổi khoảng top.`);
}

function selectProductsForGroups(groups) {
  return groups.flatMap(group => {
    const productsInRange = parsedProducts.filter(product =>
      product.rank >= group.from && product.rank <= group.to
    );
    return sampleProducts(productsInRange, group.count, group.name);
  });
}

function getMaxHistoryDuplicateCount(productIds) {
  const history = readDownloadHistory();
  if (!history.length) return 0;

  const currentIds = new Set(productIds);
  return Math.max(...history.map(entry =>
    entry.productIds.filter(productId => currentIds.has(productId)).length
  ));
}

function readGroups() {
  const groups = groupInputs.map((group, index) => {
    const from = readPositiveInteger(group.from, `Đoạn ${index + 1}: Từ top`);
    const to = readOptionalPositiveInteger(group.to, `Đoạn ${index + 1}: Đến top`);
    const count = readNonNegativeInteger(group.count, `Đoạn ${index + 1}: Lấy`);

    if (from > to) {
      throw new Error(`Đoạn ${index + 1}: "Từ top" phải nhỏ hơn hoặc bằng "Đến top".`);
    }

    return {
      from,
      to,
      count,
      name: Number.isFinite(to) ? `Top ${from}-${to}` : `Top ${from} trở đi`
    };
  });

  validateNonOverlappingGroups(groups);
  return groups;
}

function validateNonOverlappingGroups(groups) {
  for (let index = 1; index < groups.length; index += 1) {
    const previous = groups[index - 1];
    const current = groups[index];

    if (!Number.isFinite(previous.to)) {
      throw new Error(`Đoạn ${index} đang là "trở đi", nên không thể có đoạn ${index + 1} sau đó.`);
    }

    if (current.from <= previous.to) {
      throw new Error(`Đoạn ${index + 1} phải bắt đầu từ top ${previous.to + 1} trở đi để không bị gối đầu với đoạn ${index}.`);
    }
  }
}

function readPositiveInteger(input, label) {
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} phải là số nguyên từ 1 trở lên.`);
  }
  return value;
}

function readOptionalPositiveInteger(input, label) {
  if (input.value.trim() === '') {
    return Infinity;
  }

  return readPositiveInteger(input, label);
}

function readNonNegativeInteger(input, label) {
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} phải là số nguyên từ 0 trở lên.`);
  }
  return value;
}

function parsePivotRows(rows) {
  const headerIndex = rows.findIndex(row =>
    row.some(cell => normalizeHeader(cell) === 'ma san pham') &&
    row.some(cell => normalizeHeader(cell).includes('ma phan loai')) &&
    row.some(cell => normalizeHeader(cell).includes('gia'))
  );

  if (headerIndex === -1) {
    throw new Error('Không tìm thấy dòng tiêu đề gồm Mã sản phẩm, Mã phân loại hàng, Giá đã giảm.');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const productCol = headers.findIndex(header => header === 'ma san pham');
  const variantCol = headers.findIndex(header => header.includes('ma phan loai'));
  const priceCol = headers.findIndex(header => header.includes('gia'));

  if (productCol === -1 || variantCol === -1 || priceCol === -1) {
    throw new Error('Thiếu cột bắt buộc trong file.');
  }

  const products = [];
  let currentProduct = null;

  for (const row of rows.slice(headerIndex + 1)) {
    const productId = cleanCell(row[productCol]);
    const variantId = cleanCell(row[variantCol]);
    const price = cleanCell(row[priceCol]);

    if (productId && productId.toLowerCase() !== 'grand total') {
      currentProduct = {
        productId,
        rank: products.length + 1,
        variants: []
      };
      products.push(currentProduct);
    }

    if (!currentProduct || !variantId || variantId === '-' || !price) {
      continue;
    }

    currentProduct.variants.push({ variantId, price });
  }

  return products.filter(product => product.variants.length > 0);
}

function normalizeHeader(value) {
  return cleanCell(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCell(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sampleProducts(products, count, groupName) {
  const shuffled = [...products].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map(product => ({
    ...product,
    groupName
  }));
}

function renderSummary(products, selectedProducts, rows) {
  totalProductCountEl.textContent = products.length.toLocaleString('vi-VN');
  productCountEl.textContent = selectedProducts.length.toLocaleString('vi-VN');
  variantCountEl.textContent = rows.length.toLocaleString('vi-VN');

  if (!selectedProducts.length) {
    previewBody.innerHTML = '<tr><td colspan="4">Không có sản phẩm phù hợp.</td></tr>';
    return;
  }

  previewBody.innerHTML = selectedProducts
    .sort((a, b) => a.rank - b.rank)
    .map(product => `
      <tr>
        <td>${escapeHtml(product.groupName)}</td>
        <td>${product.rank}</td>
        <td>${escapeHtml(product.productId)}</td>
        <td>${product.variants.length}</td>
      </tr>
    `)
    .join('');
}

function downloadFlashSale() {
  if (!outputRows.length) return;

  saveDownloadHistory(currentSelectedProducts);
  renderDownloadHistory();
  downloadBtn.disabled = true;
  setStatus('Đã lưu lịch sử tải. Bấm Random lại để tạo bộ mới trước lần tải tiếp theo.', 'ok');

  const worksheet = XLSX.utils.json_to_sheet(outputRows, {
    header: ['Mã sản phẩm', 'Mã phân loại hàng', 'Giá đã giảm']
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Flash Sale');
  XLSX.writeFile(workbook, 'Flash Sale.xlsx');
}

function readDownloadHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(DOWNLOAD_HISTORY_KEY) || '[]');
    if (!Array.isArray(history)) return [];

    return history
      .filter(entry => entry && Array.isArray(entry.productIds))
      .map(entry => ({
        downloadedAt: entry.downloadedAt || '',
        productIds: entry.productIds.map(cleanCell).filter(Boolean),
        products: Array.isArray(entry.products)
          ? entry.products.map(product => ({
            productId: cleanCell(product.productId),
            rank: Number(product.rank) || ''
          })).filter(product => product.productId)
          : entry.productIds.map(productId => ({
            productId: cleanCell(productId),
            rank: ''
          })).filter(product => product.productId)
      }))
      .slice(0, MAX_DOWNLOAD_HISTORY);
  } catch (error) {
    console.warn('Không đọc được lịch sử tải:', error);
    return [];
  }
}

function saveDownloadHistory(products) {
  const uniqueProducts = [];
  const seenProductIds = new Set();

  for (const product of products) {
    const productId = cleanCell(product.productId);
    if (!productId || seenProductIds.has(productId)) continue;

    seenProductIds.add(productId);
    uniqueProducts.push({
      productId,
      rank: product.rank
    });
  }

  if (!uniqueProducts.length) return;

  const history = readDownloadHistory();
  history.unshift({
    downloadedAt: new Date().toISOString(),
    productIds: uniqueProducts.map(product => product.productId),
    products: uniqueProducts
  });

  localStorage.setItem(
    DOWNLOAD_HISTORY_KEY,
    JSON.stringify(history.slice(0, MAX_DOWNLOAD_HISTORY))
  );
}

function renderDownloadHistory() {
  const history = readDownloadHistory();

  if (!history.length) {
    historyBody.className = 'history-grid';
    historyBody.innerHTML = '<div class="empty-history">Chưa có lịch sử tải.</div>';
    return;
  }

  historyBody.className = 'history-grid';
  historyBody.innerHTML = history.map((entry, index) => {
    const products = entry.products && entry.products.length
      ? entry.products
      : entry.productIds.map(productId => ({ productId, rank: '' }));

    const items = products.map(product => `
      <div class="history-item">
        <strong>Top ${product.rank ? product.rank : '-'}</strong>
        <span>${escapeHtml(product.productId)}</span>
      </div>
    `).join('');

    return `
      <div class="history-column">
        <div class="history-title">Lần ${index + 1}</div>
        <div class="history-list">${items}</div>
      </div>
    `;
  }).join('');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
