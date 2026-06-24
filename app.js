const refreshAutoFsBtn = document.getElementById('refreshAutoFsBtn');
const downloadBtn = document.getElementById('downloadBtn');
const downloadBatchBtn = document.getElementById('downloadBatchBtn');
const statusEl = document.getElementById('status');
const autoMinimumInventoryInput = document.getElementById('autoMinimumInventory');
const priceAdjustmentInput = document.getElementById('priceAdjustment');
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
let currentRevenueTree = [];
let dashboardLoaded = false;

const GOOGLE_SHEET_ID = '1Pi__I2Uwd3OTGp7ff8Ju6qC0oQHidTZMu11ljZbNPM4';
const GOOGLE_SHEET_GID = '1099495700';
const LAST_MONTH_REVENUE_SHEET = 'Last Month Revenue';
const THIS_MONTH_REVENUE_SHEET = 'This Month Revenue';
const DOWNLOAD_HISTORY_KEY = 'flashSaleRecentDownloadedProductIds';
const CONFIG_STORAGE_KEY = 'flashSaleToolConfig';
const MAX_DOWNLOAD_HISTORY = 5;
const MAX_ALLOWED_DUPLICATES = 0;
const MAX_RANDOM_ATTEMPTS = 500;
const BATCH_DOWNLOAD_COUNT = 8;
const RANDOM_TIMEOUT_MS = 15000;

refreshAutoFsBtn.addEventListener('click', handleGoogleSheet);
downloadBtn.addEventListener('click', downloadFlashSale);
downloadBatchBtn.addEventListener('click', downloadFlashSaleBatch);
refreshDashboardBtn.addEventListener('click', handleDashboard);
dashboardSearchInput.addEventListener('input', () => {
  renderRevenueTree(currentRevenueTree);
});
tabButtons.forEach(button => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});
loadSavedConfig();
bindConfigPersistence();
handleGoogleSheet();

function switchTab(panelId) {
  tabButtons.forEach(button => {
    const isActive = button.dataset.tab === panelId;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
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
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type ? `status ${type}` : 'status';
}

function setDashboardStatus(message, type) {
  dashboardStatusEl.textContent = message;
  dashboardStatusEl.className = type
    ? `status dashboard-status ${type}`
    : 'status dashboard-status';
}

function resetResult() {
  parsedProducts = [];
  downloadBtn.disabled = true;
  downloadBatchBtn.disabled = true;
}

async function handleGoogleSheet() {
  resetResult();

  try {
    setStatus('Đang lấy dữ liệu từ Google Sheet...', '');
    refreshAutoFsBtn.disabled = true;

    const rows = await loadGoogleSheetRows({ gid: GOOGLE_SHEET_GID });
    parsedProducts = parsePivotRows(rows);
    downloadBtn.disabled = false;
    downloadBatchBtn.disabled = false;
    setStatus('Đã lấy dữ liệu từ Google Sheet. Chọn kiểu tải file.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi: ${error.message}`, 'error');
  } finally {
    refreshAutoFsBtn.disabled = false;
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

function tryGenerateUniqueSelection(
  groups,
  pendingProductIdLists = [],
  includeDownloadHistory = true,
  products = parsedProducts,
  deadline = Infinity
) {
  const expectedProductCount = groups.reduce((total, group) => total + group.count, 0);

  for (
    let attempt = 0;
    attempt < MAX_RANDOM_ATTEMPTS && Date.now() < deadline;
    attempt += 1
  ) {
    const selectedProducts = selectProductsForGroups(groups, products);
    const selectedProductIds = selectedProducts.map(product => product.productId);

    if (
      selectedProducts.length !== expectedProductCount ||
      hasDuplicateValues(selectedProductIds)
    ) {
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

function selectProductsForGroups(groups, products = parsedProducts) {
  return groups.flatMap(group => {
    const productsInRange = products.filter(product =>
      product.rank >= group.from && product.rank <= group.to
    );
    return sampleProducts(productsInRange, group.count, group.name);
  });
}

function validateBatchProductCapacity(groups, products, batchCount) {
  const insufficientGroups = groups.flatMap((group, index) => {
    const availableCount = products.filter(product =>
      product.rank >= group.from && product.rank <= group.to
    ).length;
    const requiredCount = group.count * batchCount;

    if (availableCount >= requiredCount) {
      return [];
    }

    return [{
      index: index + 1,
      name: group.name,
      availableCount,
      requiredCount,
      missingCount: requiredCount - availableCount
    }];
  });

  if (!insufficientGroups.length) {
    return;
  }

  const details = insufficientGroups.map(group =>
    `Đoạn ${group.index} (${group.name}) cần ${group.requiredCount} sản phẩm, hiện có ${group.availableCount}, thiếu ${group.missingCount}`
  ).join('; ');

  throw new Error(
    `Không đủ sản phẩm hợp lệ để tạo ${batchCount} file không trùng nhau. ${details}. ` +
    'Hãy giảm số lượng lấy, mở rộng khoảng top hoặc giảm ngưỡng tồn kho.'
  );
}

function createNonOverlappingBatchSelections(groups, products, batchCount) {
  validateBatchProductCapacity(groups, products, batchCount);

  const productPools = groups.map(group => ({
    group,
    products: shuffleProducts(products.filter(product =>
      product.rank >= group.from && product.rank <= group.to
    ))
  }));

  return Array.from({ length: batchCount }, (_, batchIndex) =>
    productPools.flatMap(({ group, products: pool }) => {
      const startIndex = batchIndex * group.count;
      return pool.slice(startIndex, startIndex + group.count).map(product => ({
        ...product,
        groupName: group.name
      }));
    })
  );
}

function getEligibleAutoFsProducts() {
  const minimumInventory = readNonNegativeInteger(
    autoMinimumInventoryInput,
    'Tồn kho phân loại tối thiểu'
  );

  return parsedProducts
    .map(product => ({
      ...product,
      variants: product.variants.filter(variant =>
        variant.totalInventory >= minimumInventory
      )
    }))
    .filter(product => product.variants.length > 0);
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
    setInputValue(autoMinimumInventoryInput, config.autoMinimumInventory);
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
    autoMinimumInventory: autoMinimumInventoryInput.value,
    priceAdjustment: priceAdjustmentInput.value
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
      autoMinimumInventoryInput
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
  const totalInventoryCol = headers.findIndex(header => header.includes('tong ton kho'));

  if (productCol === -1 || variantCol === -1 || priceCol === -1 || totalInventoryCol === -1) {
    throw new Error('Thiếu cột bắt buộc trong file. Sheet Pivot Table cần có Mã sản phẩm, Mã phân loại hàng, Giá đã giảm và Tổng Tồn Kho.');
  }

  const products = [];
  let currentProduct = null;

  for (const row of rows.slice(headerIndex + 1)) {
    const productId = cleanCell(row[productCol]);
    const variantId = cleanCell(row[variantCol]);
    const price = cleanCell(row[priceCol]);
    const totalInventory = parseOptionalNumber(row[totalInventoryCol]);

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

    currentProduct.variants.push({
      variantId,
      price,
      totalInventory: totalInventory === null ? 0 : totalInventory
    });
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

function setBatchButtonLoading(button, isLoading, loadingText, defaultText) {
  if (!button.dataset.defaultHtml) {
    button.dataset.defaultHtml = button.innerHTML;
  }

  button.innerHTML = isLoading
    ? `
      <span class="button-spinner" aria-hidden="true"></span>
      <span><strong>${escapeHtml(loadingText)}</strong><small>Vui lòng chờ trong giây lát</small></span>
    `
    : button.dataset.defaultHtml;
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

async function downloadFlashSale() {
  if (!parsedProducts.length) return;

  const defaultButtonText = downloadBtn.textContent;
  downloadBatchBtn.disabled = true;
  setBatchButtonLoading(downloadBtn, true, 'Đang tìm file phù hợp...', defaultButtonText);
  setStatus('Đang random file không trùng với 5 file tải gần nhất...', '');

  try {
    const groups = readGroups();
    const eligibleProducts = getEligibleAutoFsProducts();
    const priceAdjustment = readPriceAdjustment(priceAdjustmentInput, 'Điều chỉnh giá');

    if (!eligibleProducts.length) {
      throw new Error('Không có sản phẩm nào còn phân loại đạt ngưỡng tồn kho.');
    }

    const deadline = Date.now() + RANDOM_TIMEOUT_MS;
    const selectedProducts = await generateBatchUniqueSelection(
      () => tryGenerateUniqueSelection(groups, [], true, eligibleProducts, deadline),
      deadline,
      'Không tìm được file phù hợp trong 15 giây. Hãy thay đổi khoảng top rồi thử lại.'
    );
    const rows = buildOutputRowsFromProducts(selectedProducts);
    const exportRows = buildAdjustedExportRowsWithAdjustment(rows, priceAdjustment);

    if (!exportRows.length) {
      throw new Error('Không tìm thấy dòng phân loại có giá bán để xuất.');
    }

    writeFlashSaleFile(exportRows, `Flash Sale ${getFileDateStamp()}.xlsx`);
    saveDownloadHistory(selectedProducts);
    setStatus('Đã random và tải 1 file phù hợp.', 'ok');
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi: ${error.message}`, 'error');
  } finally {
    setBatchButtonLoading(downloadBtn, false, '', defaultButtonText);
    downloadBatchBtn.disabled = false;
  }
}

async function downloadFlashSaleBatch() {
  if (!parsedProducts.length) return;

  const defaultBatchButtonText = downloadBatchBtn.textContent;
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
  let eligibleProducts;
  let selectedProductBatches;

  try {
    groups = readGroups();
    eligibleProducts = getEligibleAutoFsProducts();

    if (!eligibleProducts.length) {
      throw new Error('Không có sản phẩm nào còn phân loại đạt ngưỡng tồn kho.');
    }

    selectedProductBatches = createNonOverlappingBatchSelections(
      groups,
      eligibleProducts,
      BATCH_DOWNLOAD_COUNT
    );
    priceAdjustment = readPriceAdjustment(priceAdjustmentInput, 'Điều chỉnh giá');
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi: ${error.message}`, 'error');
    downloadBtn.disabled = false;
    setBatchButtonLoading(downloadBatchBtn, false, '', defaultBatchButtonText);
    return;
  }

  let completedCount = 0;

  try {
    const zip = createZipArchive();

    for (let index = 1; index <= BATCH_DOWNLOAD_COUNT; index += 1) {
      const selectedProducts = selectedProductBatches[index - 1];
      const rows = buildOutputRowsFromProducts(selectedProducts);
      const exportRows = buildAdjustedExportRowsWithAdjustment(rows, priceAdjustment);

      if (!exportRows.length) {
        throw new Error('Không tìm thấy dòng phân loại có giá bán để xuất.');
      }

      zip.file(
        `Flash Sale ${getFileDateStamp()} ${formatBatchNumber(index)}.xlsx`,
        buildFlashSaleWorkbookData(exportRows)
      );

      completedCount = index;
    }

    await writeZipFile(zip, `Flash Sale ${getFileDateStamp()} 8 files.zip`);
    downloadBtn.disabled = false;
    setBatchButtonLoading(downloadBatchBtn, false, '', defaultBatchButtonText);
    setStatus(`Đã tải ZIP gồm ${BATCH_DOWNLOAD_COUNT} file. Lần tải này không được lưu vào lịch sử.`, 'ok');
  } catch (error) {
    console.error(error);
    downloadBtn.disabled = false;
    setBatchButtonLoading(downloadBatchBtn, false, '', defaultBatchButtonText);
    setStatus(`Lỗi khi tạo file thứ ${completedCount + 1}: ${error.message}`, 'error');
  }
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
