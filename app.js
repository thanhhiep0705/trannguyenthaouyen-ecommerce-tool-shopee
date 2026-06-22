const refreshAutoFsBtn = document.getElementById('refreshAutoFsBtn');
const rerollBtn = document.getElementById('rerollBtn');
const downloadBtn = document.getElementById('downloadBtn');
const downloadBatchBtn = document.getElementById('downloadBatchBtn');
const statusEl = document.getElementById('status');
const productCountEl = document.getElementById('productCount');
const variantCountEl = document.getElementById('variantCount');
const totalProductCountEl = document.getElementById('totalProductCount');
const previewBody = document.getElementById('previewBody');
const historyBody = document.getElementById('historyBody');
const priceAdjustmentInput = document.getElementById('priceAdjustment');
const refreshInventoryFsBtn = document.getElementById('refreshInventoryFsBtn');
const rerollInventoryBtn = document.getElementById('rerollInventoryBtn');
const downloadInventoryBtn = document.getElementById('downloadInventoryBtn');
const downloadInventoryBatchBtn = document.getElementById('downloadInventoryBatchBtn');
const inventoryStatusEl = document.getElementById('inventoryStatus');
const minimumInventoryInput = document.getElementById('minimumInventory');
const inventoryPriceAdjustmentInput = document.getElementById('inventoryPriceAdjustment');
const inventoryProductCountEl = document.getElementById('inventoryProductCount');
const inventoryVariantCountEl = document.getElementById('inventoryVariantCount');
const eligibleInventoryProductCountEl = document.getElementById('eligibleInventoryProductCount');
const inventoryPreviewBody = document.getElementById('inventoryPreviewBody');
const inventoryHistoryBody = document.getElementById('inventoryHistoryBody');
const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
const dashboardStatusEl = document.getElementById('dashboardStatus');
const lastMonthTotalEl = document.getElementById('lastMonthTotal');
const thisMonthTotalEl = document.getElementById('thisMonthTotal');
const dashboardChangeEl = document.getElementById('dashboardChange');
const revenueTreeBody = document.getElementById('revenueTreeBody');
const dashboardSearchInput = document.getElementById('dashboardSearch');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

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
let inventoryProducts = [];
let inventoryOutputRows = [];
let currentInventorySelectedProducts = [];
let inventoryLoaded = false;
let currentRevenueTree = [];
let dashboardLoaded = false;

const GOOGLE_SHEET_ID = '1Pi__I2Uwd3OTGp7ff8Ju6qC0oQHidTZMu11ljZbNPM4';
const GOOGLE_SHEET_GID = '1099495700';
const LAST_MONTH_REVENUE_SHEET = 'Last Month Revenue';
const THIS_MONTH_REVENUE_SHEET = 'This Month Revenue';
const DOWNLOAD_HISTORY_KEY = 'flashSaleRecentDownloadedProductIds';
const CONFIG_STORAGE_KEY = 'flashSaleToolConfig';
const INVENTORY_SHEET = 'FS theo tồn';
const INVENTORY_DOWNLOAD_HISTORY_KEY = 'inventoryFlashSaleRecentDownloadedProductIds';
const INVENTORY_PRODUCT_COUNT = 10;
const MAX_DOWNLOAD_HISTORY = 5;
const MAX_ALLOWED_DUPLICATES = 0;
const MAX_RANDOM_ATTEMPTS = 500;
const BATCH_DOWNLOAD_COUNT = 8;
const BATCH_RANDOM_TIMEOUT_MS = 15000;

refreshAutoFsBtn.addEventListener('click', handleGoogleSheet);
rerollBtn.addEventListener('click', () => {
  try {
    generateResult();
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi: ${error.message}`, 'error');
  }
});
downloadBtn.addEventListener('click', downloadFlashSale);
downloadBatchBtn.addEventListener('click', downloadFlashSaleBatch);
refreshInventoryFsBtn.addEventListener('click', handleInventoryGoogleSheet);
rerollInventoryBtn.addEventListener('click', () => {
  try {
    generateInventoryResult();
  } catch (error) {
    console.error(error);
    setInventoryStatus(`Lỗi: ${error.message}`, 'error');
  }
});
downloadInventoryBtn.addEventListener('click', downloadInventoryFlashSale);
downloadInventoryBatchBtn.addEventListener('click', downloadInventoryFlashSaleBatch);
refreshDashboardBtn.addEventListener('click', handleDashboard);
dashboardSearchInput.addEventListener('input', () => {
  renderRevenueTree(currentRevenueTree);
});
tabButtons.forEach(button => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});
loadSavedConfig();
bindConfigPersistence();
renderDownloadHistory();
renderInventoryDownloadHistory();
handleGoogleSheet();

function switchTab(panelId) {
  tabButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === panelId);
  });

  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === panelId);
  });

  if (panelId === 'autoFsPanel' && !parsedProducts.length) {
    handleGoogleSheet();
  }

  if (panelId === 'dashboardPanel' && !dashboardLoaded) {
    handleDashboard();
  }

  if (panelId === 'inventoryFsPanel' && !inventoryLoaded) {
    handleInventoryGoogleSheet();
  }
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : 'status';
}

function setDashboardStatus(message, type) {
  dashboardStatusEl.textContent = message;
  dashboardStatusEl.className = type ? `status ${type}` : 'status';
}

function setInventoryStatus(message, type) {
  inventoryStatusEl.textContent = message;
  inventoryStatusEl.className = type ? `status ${type}` : 'status';
}

function resetResult() {
  outputRows = [];
  parsedProducts = [];
  currentSelectedProductIds = [];
  currentSelectedProducts = [];
  rerollBtn.disabled = true;
  downloadBtn.disabled = true;
  downloadBatchBtn.disabled = true;
  productCountEl.textContent = '0';
  variantCountEl.textContent = '0';
  totalProductCountEl.textContent = '0';
  previewBody.innerHTML = '<tr><td colspan="4">Chưa có dữ liệu.</td></tr>';
}

async function handleGoogleSheet() {
  resetResult();

  try {
    setStatus('Đang lấy dữ liệu từ Google Sheet...', '');
    refreshAutoFsBtn.disabled = true;

    const rows = await loadGoogleSheetRows({ gid: GOOGLE_SHEET_GID });
    parsedProducts = parsePivotRows(rows);
    rerollBtn.disabled = false;
    generateResult('Đã lấy dữ liệu từ Google Sheet.');
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi: ${error.message}`, 'error');
  } finally {
    refreshAutoFsBtn.disabled = false;
  }
}

function resetInventoryResult() {
  inventoryOutputRows = [];
  currentInventorySelectedProducts = [];
  rerollInventoryBtn.disabled = true;
  downloadInventoryBtn.disabled = true;
  downloadInventoryBatchBtn.disabled = true;
  inventoryProductCountEl.textContent = '0';
  inventoryVariantCountEl.textContent = '0';
  eligibleInventoryProductCountEl.textContent = '0';
  inventoryPreviewBody.innerHTML = '<tr><td colspan="4">Chưa có dữ liệu.</td></tr>';
}

async function handleInventoryGoogleSheet() {
  resetInventoryResult();
  inventoryLoaded = false;
  inventoryProducts = [];

  try {
    setInventoryStatus('Đang lấy dữ liệu từ sheet FS theo tồn...', '');
    refreshInventoryFsBtn.disabled = true;

    const rows = await loadGoogleSheetRows({ sheetName: INVENTORY_SHEET });
    inventoryProducts = parseInventoryRows(rows);
    inventoryLoaded = true;
    rerollInventoryBtn.disabled = false;
    generateInventoryResult('Đã lấy dữ liệu từ sheet FS theo tồn.');
  } catch (error) {
    console.error(error);
    setInventoryStatus(`Lỗi: ${error.message}`, 'error');
  } finally {
    refreshInventoryFsBtn.disabled = false;
  }
}

function loadGoogleSheetRows(options = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `googleSheetCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
      tqx: `out:json;responseHandler:${callbackName}`
    });

    if (options.gid) {
      query.set('gid', options.gid);
    }

    if (options.sheetName) {
      query.set('sheet', options.sheetName);
    }

    script.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?${query.toString()}`;
    document.body.appendChild(script);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
  });
}

async function handleDashboard() {
  try {
    setDashboardStatus('Đang lấy dữ liệu Dashboard...', '');
    refreshDashboardBtn.disabled = true;

    const [lastMonthRows, thisMonthRows] = await Promise.all([
      loadGoogleSheetRows({ sheetName: LAST_MONTH_REVENUE_SHEET }),
      loadGoogleSheetRows({ sheetName: THIS_MONTH_REVENUE_SHEET })
    ]);

    const lastMonthData = parseRevenueRows(lastMonthRows, LAST_MONTH_REVENUE_SHEET);
    const thisMonthData = parseRevenueRows(thisMonthRows, THIS_MONTH_REVENUE_SHEET);
    const revenueTree = buildRevenueTree(lastMonthData, thisMonthData);
    currentRevenueTree = revenueTree;
    dashboardLoaded = true;

    renderDashboardSummary(lastMonthData.totalRevenue, thisMonthData.totalRevenue);
    renderRevenueTree(revenueTree);
    setDashboardStatus('Đã cập nhật Dashboard.', 'ok');
  } catch (error) {
    console.error(error);
    setDashboardStatus(`Lỗi: ${error.message}`, 'error');
  } finally {
    refreshDashboardBtn.disabled = false;
  }
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

function parseRevenueRows(rows, sheetName) {
  const headerIndex = findRevenueHeaderIndex(rows);
  if (headerIndex === -1) {
    throw new Error(`Không tìm thấy dòng tiêu đề trong sheet "${sheetName}".`);
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const productCol = headers.findIndex(header => header === 'ma san pham' || header.includes('ma san pham'));
  const variantCol = headers.findIndex(header => header.includes('ma phan loai'));
  const productNameCol = headers.findIndex(header => header === 'san pham' || header.includes('ten san pham'));
  const variantNameCol = headers.findIndex(header => header.includes('ten phan loai'));
  const revenueCol = findRevenueColumn(headers, rows.slice(headerIndex + 1));

  if (productCol === -1 || revenueCol === -1) {
    throw new Error(`Sheet "${sheetName}" cần có cột Mã sản phẩm và cột doanh thu.`);
  }

  const explicitProductRevenue = new Map();
  const variantProductRevenue = new Map();
  const variants = new Map();
  let currentProductId = '';

  for (const row of rows.slice(headerIndex + 1)) {
    const productCell = cleanCell(row[productCol]);
    const productId = productCell || currentProductId;
    const variantId = variantCol === -1 ? '' : cleanCell(row[variantCol]);
    const productName = productNameCol === -1 ? '' : cleanCell(row[productNameCol]);
    const variantName = variantNameCol === -1 ? '' : cleanCell(row[variantNameCol]);
    const revenue = parseOptionalNumber(row[revenueCol]);
    const hasVariant = Boolean(variantId && variantId !== '-');

    if (productCell && productCell.toLowerCase() !== 'grand total') {
      currentProductId = productCell;
    }

    if (!currentProductId || revenue === null) {
      continue;
    }

    if (hasVariant) {
      addRevenue(variantProductRevenue, currentProductId, currentProductId, revenue, '', productName);
      const variantKey = `${currentProductId}||${variantId}`;
      addRevenue(variants, variantKey, variantId, revenue, currentProductId, variantName);
    } else if (productCell && productCell.toLowerCase() !== 'grand total') {
      addRevenue(explicitProductRevenue, currentProductId, currentProductId, revenue, '', productName);
    }
  }

  const products = mergeProductRevenue(explicitProductRevenue, variantProductRevenue);
  const totalRevenue = [...products.values()].reduce((total, product) => total + product.revenue, 0);

  return { products, variants, totalRevenue };
}

function mergeProductRevenue(explicitProductRevenue, variantProductRevenue) {
  const products = new Map();
  const productIds = new Set([
    ...explicitProductRevenue.keys(),
    ...variantProductRevenue.keys()
  ]);

  productIds.forEach(productId => {
    const explicit = explicitProductRevenue.get(productId);
    const variant = variantProductRevenue.get(productId);
    products.set(productId, explicit || variant);
  });

  return products;
}

function findRevenueHeaderIndex(rows) {
  return rows.findIndex(row => {
    const normalized = row.map(normalizeHeader);
    return normalized.some(header => header.includes('ma san pham')) &&
      normalized.some(header =>
        header.includes('doanh thu') ||
        header.includes('revenue') ||
        header.includes('vnd')
      );
  });
}

function findRevenueColumn(headers, dataRows) {
  const directMatch = headers.findIndex(header =>
    header.includes('doanh thu') ||
    header.includes('revenue') ||
    header.includes('vnd')
  );

  if (directMatch !== -1) {
    return directMatch;
  }

  let bestIndex = -1;
  let bestNumericCount = 0;

  headers.forEach((header, index) => {
    if (header.includes('ma ') || header.includes('ten ')) {
      return;
    }

    const numericCount = dataRows.reduce((count, row) => (
      parseOptionalNumber(row[index]) === null ? count : count + 1
    ), 0);

    if (numericCount > bestNumericCount) {
      bestNumericCount = numericCount;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function addRevenue(map, key, label, revenue, productId = '', name = '') {
  const current = map.get(key) || {
    key,
    label,
    productId,
    name,
    revenue: 0
  };

  if (!current.name && name) {
    current.name = name;
  }

  current.revenue += revenue;
  map.set(key, current);
}

function compareRevenueMaps(lastMonthMap, thisMonthMap) {
  const keys = new Set([...lastMonthMap.keys(), ...thisMonthMap.keys()]);

  return [...keys].map(key => {
    const last = lastMonthMap.get(key);
    const current = thisMonthMap.get(key);
    const lastRevenue = last ? last.revenue : 0;
    const thisRevenue = current ? current.revenue : 0;
    const diff = thisRevenue - lastRevenue;
    const percent = lastRevenue === 0
      ? (thisRevenue === 0 ? 0 : null)
      : (diff / lastRevenue) * 100;
    const source = current || last;

    return {
      key,
      label: source.label,
      productId: source.productId,
      name: source.name || '',
      lastRevenue,
      thisRevenue,
      diff,
      percent
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

function buildRevenueTree(lastMonthData, thisMonthData) {
  const productRows = compareRevenueMaps(lastMonthData.products, thisMonthData.products);
  const variantRows = compareRevenueMaps(lastMonthData.variants, thisMonthData.variants);
  const variantsByProduct = new Map();

  variantRows.forEach(variant => {
    if (!variantsByProduct.has(variant.productId)) {
      variantsByProduct.set(variant.productId, []);
    }

    variantsByProduct.get(variant.productId).push(variant);
  });

  return productRows.map(product => ({
    ...product,
    variants: (variantsByProduct.get(product.key) || [])
      .sort((a, b) => b.thisRevenue - a.thisRevenue)
  })).sort((a, b) => b.thisRevenue - a.thisRevenue);
}

function renderDashboardSummary(lastTotal, thisTotal) {
  const diff = thisTotal - lastTotal;
  const percent = lastTotal === 0 ? null : (diff / lastTotal) * 100;

  lastMonthTotalEl.textContent = formatCurrency(lastTotal);
  thisMonthTotalEl.textContent = formatCurrency(thisTotal);
  dashboardChangeEl.textContent = formatPercent(percent);
  dashboardChangeEl.className = getChangeClass(diff);
}

function renderRevenueTree(products) {
  const filteredProducts = filterRevenueTree(products, dashboardSearchInput.value);

  if (!filteredProducts.length) {
    const message = products.length ? 'Không tìm thấy mã phù hợp.' : 'Chưa có dữ liệu.';
    revenueTreeBody.innerHTML = `<tr><td colspan="6">${message}</td></tr>`;
    return;
  }

  revenueTreeBody.innerHTML = filteredProducts.slice(0, 100).map(product => {
    const productRow = renderRevenueTreeRow(product, true);
    const variantRows = product.variants.map(variant =>
      renderRevenueTreeRow(variant, false)
    ).join('');

    return productRow + variantRows;
  }).join('');
}

function filterRevenueTree(products, query) {
  const normalizedQuery = cleanCell(query).toLowerCase();
  if (!normalizedQuery) {
    return products;
  }

  return products.reduce((filteredProducts, product) => {
    const productMatches = matchesSearch(product.key, normalizedQuery) ||
      matchesSearch(product.name, normalizedQuery);
    const matchingVariants = product.variants.filter(variant =>
      matchesSearch(variant.label, normalizedQuery) ||
      matchesSearch(variant.name, normalizedQuery)
    );

    if (productMatches) {
      filteredProducts.push(product);
      return filteredProducts;
    }

    if (matchingVariants.length) {
      filteredProducts.push({
        ...product,
        variants: matchingVariants
      });
    }

    return filteredProducts;
  }, []);
}

function matchesSearch(value, normalizedQuery) {
  return cleanCell(value).toLowerCase().includes(normalizedQuery);
}

function renderRevenueTreeRow(row, isProduct) {
  const diffClass = getChangeClass(row.diff);
  const percentText = formatPercent(row.percent);
  const barWidth = getPercentBarWidth(row.percent);
  const productId = isProduct ? row.key : row.productId;
  const variantId = isProduct ? '' : row.label;
  const displayCode = isProduct ? productId : variantId;
  const rowClass = isProduct ? 'revenue-product-row' : 'revenue-variant-row';
  const name = row.name || '-';
  const escapedName = escapeHtml(name);

  return `
    <tr class="${rowClass}">
      <td>${escapeHtml(displayCode || '-')}</td>
      <td class="name-cell">
        <span class="name-ellipsis" title="${escapedName}">${escapedName}</span>
      </td>
      <td>${formatCurrency(row.lastRevenue)}</td>
      <td>${formatCurrency(row.thisRevenue)}</td>
      <td class="${diffClass}">${formatSignedCurrency(row.diff)}</td>
      <td class="percent-cell ${diffClass}">
        ${percentText}
        <div class="percent-bar">
          <span class="percent-fill" style="--bar-width: ${barWidth}%"></span>
        </div>
      </td>
    </tr>
  `;
}

function getPercentBarWidth(percent) {
  if (percent === null || !Number.isFinite(percent)) {
    return 100;
  }

  return Math.min(Math.abs(percent), 100);
}

function getChangeClass(value) {
  if (value > 0) return 'change-up';
  if (value < 0) return 'change-down';
  return 'change-flat';
}

function formatCurrency(value) {
  return Math.round(value).toLocaleString('vi-VN');
}

function formatSignedCurrency(value) {
  const formatted = formatCurrency(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatPercent(percent) {
  if (percent === null) {
    return 'Mới';
  }

  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
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

  outputRows = buildOutputRowsFromProducts(selectedProducts);

  renderSummary(parsedProducts, selectedProducts, outputRows);

  if (!outputRows.length) {
    setStatus('Không tìm thấy dòng phân loại có giá bán để xuất.', 'error');
    return;
  }

  downloadBtn.disabled = false;
  downloadBatchBtn.disabled = false;
  setStatus(`${prefixMessage} Bấm tải để xuất file.`, 'ok');
}

function generateUniqueSelection(groups, pendingProductIdLists = [], includeDownloadHistory = true) {
  const selection = tryGenerateUniqueSelection(
    groups,
    pendingProductIdLists,
    includeDownloadHistory
  );

  if (selection) {
    return selection;
  }

  if (!includeDownloadHistory) {
    throw new Error('Không random đủ các file không trùng sản phẩm nhau trong lần tải hàng loạt này. Hãy giảm số lượng lấy hoặc đổi khoảng top.');
  }

  throw new Error('Không random được bộ mới không trùng sản phẩm nào với 5 lần tải gần nhất. Hãy giảm số lượng lấy hoặc đổi khoảng top.');
}

function tryGenerateUniqueSelection(groups, pendingProductIdLists = [], includeDownloadHistory = true) {
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
    const selectedProducts = selectProductsForGroups(groups);
    const selectedProductIds = selectedProducts.map(product => product.productId);

    if (hasDuplicateValues(selectedProductIds)) {
      continue;
    }

    const duplicateCount = getMaxHistoryDuplicateCount(
      selectedProductIds,
      DOWNLOAD_HISTORY_KEY,
      pendingProductIdLists,
      includeDownloadHistory
    );

    if (duplicateCount <= MAX_ALLOWED_DUPLICATES) {
      return selectedProducts;
    }
  }

  return null;
}

function hasDuplicateValues(values) {
  return new Set(values).size !== values.length;
}

function generateInventoryResult(prefixMessage = 'Đã random lại kết quả.') {
  inventoryOutputRows = [];
  currentInventorySelectedProducts = [];
  downloadInventoryBtn.disabled = true;
  downloadInventoryBatchBtn.disabled = true;
  inventoryProductCountEl.textContent = '0';
  inventoryVariantCountEl.textContent = '0';
  inventoryPreviewBody.innerHTML = '<tr><td colspan="4">Đang random kết quả...</td></tr>';

  if (!inventoryProducts.length) {
    setInventoryStatus('Chưa có dữ liệu hợp lệ từ sheet FS theo tồn.', 'error');
    return;
  }

  const minimumInventory = readNonNegativeInteger(
    minimumInventoryInput,
    'Tồn tối thiểu tại mỗi kho'
  );
  const eligibleProducts = inventoryProducts
    .map(product => ({
      ...product,
      variants: product.variants.filter(variant =>
        variant.bnInventory >= minimumInventory &&
        variant.hcmInventory >= minimumInventory
      )
    }))
    .filter(product => product.variants.length > 0);

  eligibleInventoryProductCountEl.textContent = eligibleProducts.length.toLocaleString('vi-VN');

  if (eligibleProducts.length < INVENTORY_PRODUCT_COUNT) {
    inventoryPreviewBody.innerHTML = '<tr><td colspan="4">Không đủ sản phẩm phù hợp.</td></tr>';
    throw new Error(
      `Chỉ có ${eligibleProducts.length} sản phẩm đạt tồn kho, cần ít nhất ${INVENTORY_PRODUCT_COUNT} sản phẩm.`
    );
  }

  const selectedProducts = generateInventoryUniqueSelection(eligibleProducts);
  currentInventorySelectedProducts = selectedProducts;
  inventoryOutputRows = buildOutputRowsFromProducts(selectedProducts);

  renderInventorySummary(selectedProducts);
  downloadInventoryBtn.disabled = false;
  downloadInventoryBatchBtn.disabled = false;
  setInventoryStatus(`${prefixMessage} Bấm tải để xuất file.`, 'ok');
}

function generateInventoryUniqueSelection(
  eligibleProducts,
  pendingProductIdLists = [],
  includeDownloadHistory = true
) {
  const selection = tryGenerateInventoryUniqueSelection(
    eligibleProducts,
    pendingProductIdLists,
    includeDownloadHistory
  );

  if (selection) {
    return selection;
  }

  throw new Error(
    includeDownloadHistory
      ? 'Không random được bộ mới không trùng sản phẩm nào với 5 lần tải gần nhất. Hãy giảm ngưỡng tồn kho để tăng số sản phẩm phù hợp.'
      : 'Không random đủ các file không trùng sản phẩm nhau trong lần tải hàng loạt này. Hãy giảm ngưỡng tồn kho để tăng số sản phẩm phù hợp.'
  );
}

function tryGenerateInventoryUniqueSelection(
  eligibleProducts,
  pendingProductIdLists = [],
  includeDownloadHistory = true
) {
  const historyProductSets = (
    includeDownloadHistory
      ? readDownloadHistory(INVENTORY_DOWNLOAD_HISTORY_KEY).map(entry => new Set(entry.productIds))
      : []
  ).concat(pendingProductIdLists.map(productIds => new Set(productIds)));

  if (!historyProductSets.length) {
    return sampleProducts(eligibleProducts, INVENTORY_PRODUCT_COUNT, 'Theo tồn');
  }

  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
    const selectedProducts = [];
    const duplicateCounts = historyProductSets.map(() => 0);

    for (const product of shuffleProducts(eligibleProducts)) {
      const canSelect = historyProductSets.every((productIds, historyIndex) =>
        duplicateCounts[historyIndex] +
          (productIds.has(product.productId) ? 1 : 0) <= MAX_ALLOWED_DUPLICATES
      );

      if (!canSelect) continue;

      selectedProducts.push({
        ...product,
        groupName: 'Theo tồn'
      });
      historyProductSets.forEach((productIds, historyIndex) => {
        if (productIds.has(product.productId)) {
          duplicateCounts[historyIndex] += 1;
        }
      });

      if (selectedProducts.length === INVENTORY_PRODUCT_COUNT) {
        return selectedProducts;
      }
    }
  }

  return null;
}

function selectProductsForGroups(groups) {
  return groups.flatMap(group => {
    const productsInRange = parsedProducts.filter(product =>
      product.rank >= group.from && product.rank <= group.to
    );
    return sampleProducts(productsInRange, group.count, group.name);
  });
}

function getMaxHistoryDuplicateCount(
  productIds,
  historyKey = DOWNLOAD_HISTORY_KEY,
  pendingProductIdLists = [],
  includeDownloadHistory = true
) {
  const historyProductIdLists = (
    includeDownloadHistory
      ? readDownloadHistory(historyKey).map(entry => entry.productIds)
      : []
  ).concat(pendingProductIdLists);

  if (!historyProductIdLists.length) return 0;

  const currentIds = new Set(productIds);
  return Math.max(...historyProductIdLists.map(historyProductIds =>
    historyProductIds.filter(productId => currentIds.has(productId)).length
  ));
}

function bindConfigPersistence() {
  getConfigInputs().forEach(input => {
    input.addEventListener('input', saveCurrentConfig);
    input.addEventListener('change', saveCurrentConfig);
  });
}

function loadSavedConfig() {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || '{}');
    if (!config || typeof config !== 'object') return;

    if (Array.isArray(config.groups)) {
      config.groups.forEach((groupConfig, index) => {
        const group = groupInputs[index];
        if (!group || !groupConfig || typeof groupConfig !== 'object') return;

        setInputValue(group.from, groupConfig.from);
        setInputValue(group.to, groupConfig.to);
        setInputValue(group.count, groupConfig.count);
      });
    }

    setInputValue(priceAdjustmentInput, config.priceAdjustment);
    setInputValue(minimumInventoryInput, config.minimumInventory);
    setInputValue(inventoryPriceAdjustmentInput, config.inventoryPriceAdjustment);
  } catch (error) {
    console.warn('Không đọc được cấu hình đã lưu:', error);
  }
}

function saveCurrentConfig() {
  const config = {
    groups: groupInputs.map(group => ({
      from: group.from.value,
      to: group.to.value,
      count: group.count.value
    })),
    priceAdjustment: priceAdjustmentInput.value,
    minimumInventory: minimumInventoryInput.value,
    inventoryPriceAdjustment: inventoryPriceAdjustmentInput.value
  };

  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('Không lưu được cấu hình:', error);
  }
}

function getConfigInputs() {
  return groupInputs.flatMap(group => [group.from, group.to, group.count])
    .concat([
      priceAdjustmentInput,
      minimumInventoryInput,
      inventoryPriceAdjustmentInput
    ]);
}

function setInputValue(input, value) {
  if (typeof value === 'string') {
    input.value = value;
  }
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

function parseInventoryRows(rows) {
  const headerIndex = rows.findIndex(row => {
    const headers = row.map(normalizeHeader);
    return headers.includes('ma san pham') &&
      headers.some(header => header.includes('ma phan loai')) &&
      headers.includes('daily sale') &&
      headers.some(header => header.includes('ton kho bn')) &&
      headers.some(header => header.includes('ton kho hcm'));
  });

  if (headerIndex === -1) {
    throw new Error(
      'Sheet FS theo tồn cần có các cột Mã sản phẩm, Mã phân loại hàng, Daily Sale, Tồn Kho BN và Tồn Kho HCM.'
    );
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const productCol = headers.indexOf('ma san pham');
  const variantCol = headers.findIndex(header => header.includes('ma phan loai'));
  const priceCol = headers.indexOf('daily sale');
  const bnInventoryCol = headers.findIndex(header => header.includes('ton kho bn'));
  const hcmInventoryCol = headers.findIndex(header => header.includes('ton kho hcm'));
  const productsById = new Map();

  for (const row of rows.slice(headerIndex + 1)) {
    const productId = cleanCell(row[productCol]);
    const variantId = cleanCell(row[variantCol]);
    const price = cleanCell(row[priceCol]);
    const bnInventory = parseOptionalNumber(row[bnInventoryCol]);
    const hcmInventory = parseOptionalNumber(row[hcmInventoryCol]);

    if (
      !productId ||
      !variantId ||
      variantId === '-' ||
      !price ||
      bnInventory === null ||
      hcmInventory === null
    ) {
      continue;
    }

    if (!productsById.has(productId)) {
      productsById.set(productId, {
        productId,
        rank: productsById.size + 1,
        variants: []
      });
    }

    productsById.get(productId).variants.push({
      variantId,
      price,
      bnInventory,
      hcmInventory
    });
  }

  return [...productsById.values()].filter(product => product.variants.length > 0);
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
  const shuffled = shuffleProducts(products);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map(product => ({
    ...product,
    groupName
  }));
}

function shuffleProducts(products) {
  const shuffled = [...products];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
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

function renderInventorySummary(selectedProducts) {
  inventoryProductCountEl.textContent = selectedProducts.length.toLocaleString('vi-VN');
  inventoryVariantCountEl.textContent = inventoryOutputRows.length.toLocaleString('vi-VN');

  inventoryPreviewBody.innerHTML = selectedProducts.map(product => {
    const minimumBnInventory = Math.min(...product.variants.map(variant => variant.bnInventory));
    const minimumHcmInventory = Math.min(...product.variants.map(variant => variant.hcmInventory));

    return `
      <tr>
        <td>${escapeHtml(product.productId)}</td>
        <td>${product.variants.length}</td>
        <td>${minimumBnInventory.toLocaleString('vi-VN')}</td>
        <td>${minimumHcmInventory.toLocaleString('vi-VN')}</td>
      </tr>
    `;
  }).join('');
}

function setBatchButtonLoading(button, isLoading, loadingText, defaultText) {
  button.textContent = isLoading ? loadingText : defaultText;
  button.disabled = isLoading;
  button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

async function generateBatchUniqueSelection(generateSelection, deadline, timeoutMessage) {
  let attempt = 0;

  while (Date.now() < deadline) {
    const selectedProducts = generateSelection();

    if (selectedProducts) {
      return selectedProducts;
    }

    attempt += 1;
    if (attempt % 10 === 0) {
      await waitForNextFrame();
    }
  }

  throw new Error(timeoutMessage);
}

function waitForNextFrame() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function buildOutputRowsFromProducts(products) {
  return products.flatMap(product =>
    product.variants.map(variant => ({
      'Mã sản phẩm': product.productId,
      'Mã phân loại hàng': variant.variantId,
      'Giá đã giảm': variant.price
    }))
  );
}

function downloadFlashSale() {
  if (!outputRows.length) return;

  let exportRows;
  try {
    exportRows = buildExportRows();
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi: ${error.message}`, 'error');
    return;
  }

  saveDownloadHistory(currentSelectedProducts);
  renderDownloadHistory();
  downloadBtn.disabled = true;
  setStatus('Đã lưu lịch sử tải. Bấm Random lại để tạo bộ mới trước lần tải tiếp theo.', 'ok');
  writeFlashSaleFile(exportRows, `Flash Sale ${getFileDateStamp()}.xlsx`);
}

async function downloadFlashSaleBatch() {
  if (!parsedProducts.length) return;

  const defaultBatchButtonText = downloadBatchBtn.textContent;
  rerollBtn.disabled = true;
  downloadBtn.disabled = true;
  setBatchButtonLoading(
    downloadBatchBtn,
    true,
    `Đang tạo ZIP ${BATCH_DOWNLOAD_COUNT} file...`,
    defaultBatchButtonText
  );
  setStatus(`Đang random và tạo ZIP ${BATCH_DOWNLOAD_COUNT} file...`, '');

  let groups;
  let priceAdjustment;

  try {
    groups = readGroups();
    priceAdjustment = readPriceAdjustment(priceAdjustmentInput, 'Điều chỉnh giá');
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi: ${error.message}`, 'error');
    rerollBtn.disabled = false;
    setBatchButtonLoading(downloadBatchBtn, false, '', defaultBatchButtonText);
    return;
  }

  let completedCount = 0;

  try {
    const zip = createZipArchive();
    const pendingProductIdLists = [];
    const selectedProductBatches = [];
    const deadline = Date.now() + BATCH_RANDOM_TIMEOUT_MS;

    for (let index = 1; index <= BATCH_DOWNLOAD_COUNT; index += 1) {
      const selectedProducts = await generateBatchUniqueSelection(
        () => tryGenerateUniqueSelection(groups, pendingProductIdLists, false),
        deadline,
        'Không random đủ 8 file không trùng sản phẩm nhau trong 15 giây. Hãy giảm số lượng lấy hoặc đổi khoảng top.'
      );
      const rows = buildOutputRowsFromProducts(selectedProducts);
      const exportRows = buildAdjustedExportRowsWithAdjustment(rows, priceAdjustment);

      if (!exportRows.length) {
        throw new Error('Không tìm thấy dòng phân loại có giá bán để xuất.');
      }

      zip.file(
        `Flash Sale ${getFileDateStamp()} ${formatBatchNumber(index)}.xlsx`,
        buildFlashSaleWorkbookData(exportRows)
      );

      pendingProductIdLists.push(selectedProducts.map(product => product.productId));
      selectedProductBatches.push(selectedProducts);

      currentSelectedProducts = selectedProducts;
      currentSelectedProductIds = selectedProducts.map(product => product.productId);
      outputRows = rows;
      completedCount = index;
    }

    await writeZipFile(zip, `Flash Sale ${getFileDateStamp()} 8 files.zip`);
    selectedProductBatches.forEach(selectedProducts => saveDownloadHistory(selectedProducts));

    renderSummary(parsedProducts, currentSelectedProducts, outputRows);
    renderDownloadHistory();
    rerollBtn.disabled = false;
    downloadBtn.disabled = true;
    setBatchButtonLoading(downloadBatchBtn, false, '', defaultBatchButtonText);
    setStatus(`Đã tải ZIP gồm ${BATCH_DOWNLOAD_COUNT} file và lưu lịch sử từng file.`, 'ok');
  } catch (error) {
    console.error(error);
    renderDownloadHistory();

    if (currentSelectedProducts.length) {
      renderSummary(parsedProducts, currentSelectedProducts, outputRows);
    }

    rerollBtn.disabled = false;
    setBatchButtonLoading(downloadBatchBtn, false, '', defaultBatchButtonText);
    setStatus(`Lỗi sau khi tải ${completedCount} file: ${error.message}`, 'error');
  }
}

function downloadInventoryFlashSale() {
  if (!inventoryOutputRows.length) return;

  let exportRows;
  try {
    exportRows = buildAdjustedExportRows(
      inventoryOutputRows,
      inventoryPriceAdjustmentInput,
      'Điều chỉnh giá theo tồn'
    );
  } catch (error) {
    console.error(error);
    setInventoryStatus(`Lỗi: ${error.message}`, 'error');
    return;
  }

  saveDownloadHistory(currentInventorySelectedProducts, INVENTORY_DOWNLOAD_HISTORY_KEY);
  renderInventoryDownloadHistory();
  downloadInventoryBtn.disabled = true;
  setInventoryStatus('Đã lưu lịch sử tải. Bấm Random lại để tạo bộ mới trước lần tải tiếp theo.', 'ok');
  writeFlashSaleFile(exportRows, `Flash Sale theo tồn ${getFileDateStamp()}.xlsx`);
}

async function downloadInventoryFlashSaleBatch() {
  if (!inventoryProducts.length) return;

  const defaultBatchButtonText = downloadInventoryBatchBtn.textContent;
  rerollInventoryBtn.disabled = true;
  downloadInventoryBtn.disabled = true;
  setBatchButtonLoading(
    downloadInventoryBatchBtn,
    true,
    `Đang tạo ZIP ${BATCH_DOWNLOAD_COUNT} file...`,
    defaultBatchButtonText
  );
  setInventoryStatus(`Đang random và tạo ZIP ${BATCH_DOWNLOAD_COUNT} file...`, '');

  let eligibleProducts;
  let priceAdjustment;

  try {
    const minimumInventory = readNonNegativeInteger(
      minimumInventoryInput,
      'Tồn tối thiểu tại mỗi kho'
    );
    eligibleProducts = inventoryProducts
      .map(product => ({
        ...product,
        variants: product.variants.filter(variant =>
          variant.bnInventory >= minimumInventory &&
          variant.hcmInventory >= minimumInventory
        )
      }))
      .filter(product => product.variants.length > 0);
    eligibleInventoryProductCountEl.textContent = eligibleProducts.length.toLocaleString('vi-VN');

    if (eligibleProducts.length < INVENTORY_PRODUCT_COUNT) {
      throw new Error(
        `Chỉ có ${eligibleProducts.length} sản phẩm đạt tồn kho, cần ít nhất ${INVENTORY_PRODUCT_COUNT} sản phẩm.`
      );
    }

    priceAdjustment = readPriceAdjustment(
      inventoryPriceAdjustmentInput,
      'Điều chỉnh giá theo tồn'
    );
  } catch (error) {
    console.error(error);
    setInventoryStatus(`Lỗi: ${error.message}`, 'error');
    rerollInventoryBtn.disabled = false;
    setBatchButtonLoading(downloadInventoryBatchBtn, false, '', defaultBatchButtonText);
    return;
  }

  let completedCount = 0;

  try {
    const zip = createZipArchive();
    const pendingProductIdLists = [];
    const selectedProductBatches = [];
    const deadline = Date.now() + BATCH_RANDOM_TIMEOUT_MS;

    for (let index = 1; index <= BATCH_DOWNLOAD_COUNT; index += 1) {
      const selectedProducts = await generateBatchUniqueSelection(
        () => tryGenerateInventoryUniqueSelection(eligibleProducts, pendingProductIdLists, false),
        deadline,
        'Không random đủ 8 file không trùng sản phẩm nhau trong 15 giây. Hãy giảm ngưỡng tồn kho để tăng số sản phẩm phù hợp.'
      );
      const rows = buildOutputRowsFromProducts(selectedProducts);
      const exportRows = buildAdjustedExportRowsWithAdjustment(rows, priceAdjustment);

      if (!exportRows.length) {
        throw new Error('Không tìm thấy dòng phân loại có giá bán để xuất.');
      }

      zip.file(
        `Flash Sale theo tồn ${getFileDateStamp()} ${formatBatchNumber(index)}.xlsx`,
        buildFlashSaleWorkbookData(exportRows)
      );

      pendingProductIdLists.push(selectedProducts.map(product => product.productId));
      selectedProductBatches.push(selectedProducts);

      currentInventorySelectedProducts = selectedProducts;
      inventoryOutputRows = rows;
      completedCount = index;
    }

    await writeZipFile(zip, `Flash Sale theo tồn ${getFileDateStamp()} 8 files.zip`);
    selectedProductBatches.forEach(selectedProducts =>
      saveDownloadHistory(selectedProducts, INVENTORY_DOWNLOAD_HISTORY_KEY)
    );

    renderInventorySummary(currentInventorySelectedProducts);
    renderInventoryDownloadHistory();
    rerollInventoryBtn.disabled = false;
    downloadInventoryBtn.disabled = true;
    setBatchButtonLoading(downloadInventoryBatchBtn, false, '', defaultBatchButtonText);
    setInventoryStatus(`Đã tải ZIP gồm ${BATCH_DOWNLOAD_COUNT} file và lưu lịch sử từng file.`, 'ok');
  } catch (error) {
    console.error(error);
    renderInventoryDownloadHistory();

    if (currentInventorySelectedProducts.length) {
      renderInventorySummary(currentInventorySelectedProducts);
    }

    rerollInventoryBtn.disabled = false;
    setBatchButtonLoading(downloadInventoryBatchBtn, false, '', defaultBatchButtonText);
    setInventoryStatus(`Lỗi sau khi tải ${completedCount} file: ${error.message}`, 'error');
  }
}

function buildExportRows() {
  return buildAdjustedExportRows(outputRows, priceAdjustmentInput, 'Điều chỉnh giá');
}

function buildAdjustedExportRows(rows, adjustmentInput, adjustmentLabel) {
  const priceAdjustment = readPriceAdjustment(adjustmentInput, adjustmentLabel);
  return buildAdjustedExportRowsWithAdjustment(rows, priceAdjustment);
}

function buildAdjustedExportRowsWithAdjustment(rows, priceAdjustment) {
  return rows.map(row => ({
    ...row,
    'Giá đã giảm': adjustPrice(row['Giá đã giảm'], priceAdjustment)
  }));
}

function formatBatchNumber(number) {
  return String(number).padStart(2, '0');
}

function getFileDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function readPriceAdjustment(input = priceAdjustmentInput, label = 'Điều chỉnh giá') {
  const rawValue = input.value.trim();
  if (rawValue === '') return 0;

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} phải là một số hợp lệ.`);
  }

  return value;
}

function adjustPrice(price, adjustment) {
  const numericPrice = parsePrice(price);
  const adjustedPrice = numericPrice + adjustment;

  if (adjustedPrice < 0) {
    throw new Error('Giá sau khi điều chỉnh không được nhỏ hơn 0.');
  }

  return adjustedPrice;
}

function parsePrice(price) {
  const normalizedPrice = cleanCell(price).replace(/[^\d.-]/g, '');
  const numericPrice = Number(normalizedPrice);

  if (!Number.isFinite(numericPrice)) {
    throw new Error(`Giá không hợp lệ: ${price}`);
  }

  return numericPrice;
}

function parseOptionalNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = cleanCell(value);
  if (!text || text === '-') return null;

  const normalizedText = text
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');

  if (!normalizedText) return null;

  const lastComma = normalizedText.lastIndexOf(',');
  const lastDot = normalizedText.lastIndexOf('.');
  let numericText = normalizedText;

  if (lastComma > -1 && lastDot > -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    numericText = normalizedText
      .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.');
  } else if (lastComma > -1) {
    numericText = normalizeSingleSeparatorNumber(normalizedText, ',');
  } else if (lastDot > -1) {
    numericText = normalizeSingleSeparatorNumber(normalizedText, '.');
  }

  const number = Number(numericText);
  return Number.isFinite(number) ? number : null;
}

function normalizeSingleSeparatorNumber(value, separator) {
  const parts = value.split(separator);

  if (parts.length > 2 || parts.at(-1).length === 3) {
    return parts.join('');
  }

  if (separator === ',') {
    return value.replace(',', '.');
  }

  return value;
}

function readDownloadHistory(historyKey = DOWNLOAD_HISTORY_KEY) {
  try {
    const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
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

function saveDownloadHistory(products, historyKey = DOWNLOAD_HISTORY_KEY) {
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

  const history = readDownloadHistory(historyKey);
  history.unshift({
    downloadedAt: new Date().toISOString(),
    productIds: uniqueProducts.map(product => product.productId),
    products: uniqueProducts
  });

  localStorage.setItem(
    historyKey,
    JSON.stringify(history.slice(0, MAX_DOWNLOAD_HISTORY))
  );
}

function renderDownloadHistory() {
  renderHistory(historyBody, DOWNLOAD_HISTORY_KEY, true);
}

function renderInventoryDownloadHistory() {
  renderHistory(inventoryHistoryBody, INVENTORY_DOWNLOAD_HISTORY_KEY, false);
}

function renderHistory(container, historyKey, showRank) {
  const history = readDownloadHistory(historyKey);

  if (!history.length) {
    container.className = 'history-grid';
    container.innerHTML = '<div class="empty-history">Chưa có lịch sử tải.</div>';
    return;
  }

  container.className = 'history-grid';
  container.innerHTML = history.map((entry, index) => {
    const products = entry.products && entry.products.length
      ? entry.products
      : entry.productIds.map(productId => ({ productId, rank: '' }));

    const items = products.map(product => `
      <div class="history-item">
        ${showRank ? `<strong>Top ${product.rank ? product.rank : '-'}</strong>` : ''}
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

function writeFlashSaleFile(exportRows, fileName = 'Flash Sale.xlsx') {
  const workbook = createFlashSaleWorkbook(exportRows);
  XLSX.writeFile(workbook, fileName);
}

function createFlashSaleWorkbook(exportRows) {
  const worksheet = XLSX.utils.json_to_sheet(exportRows, {
    header: ['Mã sản phẩm', 'Mã phân loại hàng', 'Giá đã giảm']
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Flash Sale');
  return workbook;
}

function buildFlashSaleWorkbookData(exportRows) {
  return XLSX.write(createFlashSaleWorkbook(exportRows), {
    bookType: 'xlsx',
    type: 'array'
  });
}

function createZipArchive() {
  if (typeof JSZip === 'undefined') {
    throw new Error('Chưa tải được thư viện ZIP. Hãy kiểm tra kết nối mạng rồi tải lại trang.');
  }

  return new JSZip();
}

async function writeZipFile(zip, fileName) {
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
