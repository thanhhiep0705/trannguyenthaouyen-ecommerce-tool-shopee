const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
const dashboardStatusEl = document.getElementById('dashboardStatus');
const lastMonthTotalEl = document.getElementById('lastMonthTotal');
const thisMonthTotalEl = document.getElementById('thisMonthTotal');
const thisMonthTrendingEl = document.getElementById('thisMonthTrending');
const dashboardChangeEl = document.getElementById('dashboardChange');
const revenueTreeBody = document.getElementById('revenueTreeBody');
const dashboardSearchInput = document.getElementById('dashboardSearch');
const searchSummaryBar = document.getElementById('searchSummaryBar');
const searchTotalJunEl = document.getElementById('searchTotalJun');
const searchTotalJulyEl = document.getElementById('searchTotalJuly');
const searchTotalTrendingEl = document.getElementById('searchTotalTrending');
const searchTotalChangeEl = document.getElementById('searchTotalChange');
const dashboardTargetInput = document.getElementById('dashboardTarget');
const trendingVsTargetEl = document.getElementById('trendingVsTarget');
const toggleAllVariantsBtn = document.getElementById('toggleAllVariantsBtn');
const toggleAllVariantsIcon = document.getElementById('toggleAllVariantsIcon');
const editTargetBtn = document.getElementById('editTargetBtn');
const saveTargetBtn = document.getElementById('saveTargetBtn');
const cancelTargetBtn = document.getElementById('cancelTargetBtn');

let currentRevenueTree = [];
let dashboardLoaded = false;
let currentSortColumn = '';
let currentSortDirection = 'desc';
const collapsedProductIds = new Set();
let latestTrendingTotal = 0;
let originalTargetInputValue = '';
const TARGET_STORAGE_KEY = 'flashSaleDashboardTarget';

const GOOGLE_SHEET_ID = '1Pi__I2Uwd3OTGp7ff8Ju6qC0oQHidTZMu11ljZbNPM4';
const LAST_MONTH_REVENUE_SHEET = 'Jun';
const THIS_MONTH_REVENUE_SHEET = 'July';

refreshDashboardBtn.addEventListener('click', handleDashboard);
dashboardSearchInput.addEventListener('input', () => {
  renderRevenueTree(currentRevenueTree);
});
if (dashboardTargetInput) {
  dashboardTargetInput.addEventListener('input', handleTargetInput);
  dashboardTargetInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      exitTargetEditMode(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      exitTargetEditMode(false);
    }
  });
}
if (editTargetBtn) {
  editTargetBtn.addEventListener('click', enterTargetEditMode);
}
if (saveTargetBtn) {
  saveTargetBtn.addEventListener('click', () => exitTargetEditMode(true));
}
if (cancelTargetBtn) {
  cancelTargetBtn.addEventListener('click', () => exitTargetEditMode(false));
}
if (toggleAllVariantsBtn) {
  toggleAllVariantsBtn.addEventListener('click', () => {
    const shouldCollapseAll = collapsedProductIds.size === 0;
    
    if (shouldCollapseAll) {
      currentRevenueTree.forEach(product => {
        collapsedProductIds.add(product.key);
      });
    } else {
      collapsedProductIds.clear();
    }
    
    renderRevenueTree(currentRevenueTree);
  });
}

document.querySelectorAll('.sortable').forEach(header => {
  header.addEventListener('click', () => {
    const col = header.dataset.sort;
    if (currentSortColumn === col) {
      currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      currentSortColumn = col;
      currentSortDirection = col === 'name' ? 'asc' : 'desc';
    }
    applySorting();
    renderRevenueTree(currentRevenueTree);
  });
});

revenueTreeBody.addEventListener('click', event => {
  const td = event.target.closest('.revenue-product-row td:first-child');
  if (!td) return;

  const toggleBtn = td.querySelector('.toggle-variants-btn');
  if (!toggleBtn) return;

  const productId = toggleBtn.dataset.productId;
  const isCollapsed = collapsedProductIds.has(productId);

  if (isCollapsed) {
    collapsedProductIds.delete(productId);
    toggleBtn.textContent = '▼';
  } else {
    collapsedProductIds.add(productId);
    toggleBtn.textContent = '▶';
  }

  const variantRows = revenueTreeBody.querySelectorAll(`.revenue-variant-row[data-product-id="${CSS.escape(productId)}"]`);
  variantRows.forEach(row => {
    row.style.display = isCollapsed ? '' : 'none';
  });

  if (toggleAllVariantsIcon) {
    toggleAllVariantsIcon.textContent = collapsedProductIds.size === 0 ? '▼' : '▶';
  }
});

initTarget();
handleDashboard();

function setDashboardStatus(message, type) {
  dashboardStatusEl.textContent = message;
  dashboardStatusEl.className = type
    ? `status dashboard-status ${type}`
    : 'status dashboard-status';
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
    if (currentSortColumn) {
      applySorting();
    }
    dashboardLoaded = true;

    renderDashboardSummary(lastMonthData.totalRevenue, thisMonthData.totalRevenue, thisMonthData.totalTrending);
    renderRevenueTree(currentRevenueTree);
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
  const trendingCol = headers.findIndex(header => header === 'trending' || header.includes('trending'));

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

    const trendingVal = trendingCol === -1 ? null : parseOptionalNumber(row[trendingCol]);
    const trending = trendingVal === null ? revenue : trendingVal;

    if (hasVariant) {
      addRevenue(variantProductRevenue, currentProductId, currentProductId, revenue, trending, '', productName);
      const variantKey = `${currentProductId}||${variantId}`;
      addRevenue(variants, variantKey, variantId, revenue, trending, currentProductId, variantName);
    } else if (productCell && productCell.toLowerCase() !== 'grand total') {
      addRevenue(explicitProductRevenue, currentProductId, currentProductId, revenue, trending, '', productName);
    }
  }

  const products = mergeProductRevenue(explicitProductRevenue, variantProductRevenue);
  const totalRevenue = [...products.values()].reduce((total, product) => total + product.revenue, 0);
  const totalTrending = [...products.values()].reduce((total, product) => total + product.trending, 0);

  return { products, variants, totalRevenue, totalTrending };
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

function addRevenue(map, key, label, revenue, trending, productId = '', name = '') {
  const current = map.get(key) || {
    key,
    label,
    productId,
    name,
    revenue: 0,
    trending: 0
  };

  if (!current.name && name) {
    current.name = name;
  }

  current.revenue += revenue;
  current.trending += trending;
  map.set(key, current);
}

function compareRevenueMaps(lastMonthMap, thisMonthMap) {
  const keys = new Set([...lastMonthMap.keys(), ...thisMonthMap.keys()]);

  return [...keys].map(key => {
    const last = lastMonthMap.get(key);
    const current = thisMonthMap.get(key);
    const lastRevenue = last ? last.revenue : 0;
    const thisRevenue = current ? current.revenue : 0;
    const trendingRevenue = current ? current.trending : (last ? last.revenue : 0);
    const diff = trendingRevenue - lastRevenue;
    const percent = lastRevenue === 0
      ? (trendingRevenue === 0 ? 0 : null)
      : (diff / lastRevenue) * 100;
    const source = current || last;

    return {
      key,
      label: source.label,
      productId: source.productId,
      name: source.name || '',
      lastRevenue,
      thisRevenue,
      trendingRevenue,
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

  const getSortKey = item => Math.max(item.lastRevenue, item.thisRevenue, item.trendingRevenue);

  return productRows.map(product => ({
    ...product,
    variants: (variantsByProduct.get(product.key) || [])
      .sort((a, b) => getSortKey(b) - getSortKey(a))
  })).sort((a, b) => getSortKey(b) - getSortKey(a));
}

function renderDashboardSummary(lastTotal, thisTotal, thisTrendingTotal) {
  const diff = thisTrendingTotal - lastTotal;
  const percent = lastTotal === 0 ? null : (diff / lastTotal) * 100;

  lastMonthTotalEl.textContent = formatCurrency(lastTotal);
  thisMonthTotalEl.textContent = formatCurrency(thisTotal);
  if (thisMonthTrendingEl) {
    thisMonthTrendingEl.textContent = formatCurrency(thisTrendingTotal);
  }
  dashboardChangeEl.textContent = formatPercent(percent);
  dashboardChangeEl.className = getChangeClass(diff);

  latestTrendingTotal = thisTrendingTotal;
  updateTrendingVsTargetComparison();
}

function applySorting() {
  if (!currentSortColumn) return;

  const factor = currentSortDirection === 'asc' ? 1 : -1;

  const sortFn = (a, b) => {
    if (currentSortColumn === 'name') {
      const valA = a.name || '';
      const valB = b.name || '';
      return valA.localeCompare(valB, 'vi', { sensitivity: 'base' }) * factor;
    } else {
      let valA = a[currentSortColumn];
      let valB = b[currentSortColumn];

      if (valA === null || valA === undefined) valA = -Infinity;
      if (valB === null || valB === undefined) valB = -Infinity;

      if (valA !== valB) {
        return (valA - valB) * factor;
      }
      return (a.key || '').localeCompare(b.key || '');
    }
  };

  currentRevenueTree.sort(sortFn);
  currentRevenueTree.forEach(product => {
    if (product.variants && product.variants.length > 0) {
      product.variants.sort(sortFn);
    }
  });
}

function updateSortHeaderUI() {
  const headers = document.querySelectorAll('.sortable');
  headers.forEach(header => {
    const col = header.dataset.sort;
    const icon = header.querySelector('.sort-icon');
    if (col === currentSortColumn) {
      icon.textContent = currentSortDirection === 'asc' ? ' ▲' : ' ▼';
      header.classList.add('active-sort');
    } else {
      icon.textContent = ' ↕';
      header.classList.remove('active-sort');
    }
  });
}

function renderRevenueTree(products) {
  const query = (dashboardSearchInput.value || '').trim();
  const filteredProducts = filterRevenueTree(products, query);

  updateSortHeaderUI();

  if (toggleAllVariantsIcon) {
    toggleAllVariantsIcon.textContent = collapsedProductIds.size === 0 ? '▼' : '▶';
  }

  if (query && searchSummaryBar) {
    let totalJun = 0;
    let totalJuly = 0;
    let totalTrending = 0;

    filteredProducts.forEach(product => {
      totalJun += product.lastRevenue || 0;
      totalJuly += product.thisRevenue || 0;
      totalTrending += product.trendingRevenue || 0;
    });

    const diff = totalTrending - totalJun;
    const percent = totalJun === 0 ? (totalTrending === 0 ? 0 : null) : (diff / totalJun) * 100;

    searchTotalJunEl.textContent = formatCurrency(totalJun);
    searchTotalJulyEl.textContent = formatCurrency(totalJuly);
    searchTotalTrendingEl.textContent = formatCurrency(totalTrending);
    searchTotalChangeEl.textContent = formatPercent(percent);
    searchTotalChangeEl.className = getChangeClass(diff);
    searchSummaryBar.style.display = 'flex';
  } else if (searchSummaryBar) {
    searchSummaryBar.style.display = 'none';
  }

  if (!filteredProducts.length) {
    const message = products.length ? 'Không tìm thấy mã phù hợp.' : 'Chưa có dữ liệu.';
    revenueTreeBody.innerHTML = `<tr><td colspan="6">${message}</td></tr>`;
    return;
  }

  revenueTreeBody.innerHTML = filteredProducts.slice(0, 100).map(product => {
    const isCollapsed = collapsedProductIds.has(product.key);
    const productRow = renderRevenueTreeRow(product, true, isCollapsed);
    const variantRows = product.variants.map(variant =>
      renderRevenueTreeRow(variant, false, isCollapsed)
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

function renderRevenueTreeRow(row, isProduct, isCollapsedOrParentCollapsed = false) {
  const diffClass = getChangeClass(row.diff);
  const percentText = formatPercent(row.percent);
  const barWidth = getPercentBarWidth(row.percent);
  const productId = isProduct ? row.key : row.productId;
  const variantId = isProduct ? '' : row.label;
  const displayCode = isProduct ? productId : variantId;
  const rowClass = isProduct ? 'revenue-product-row' : 'revenue-variant-row';
  const name = row.name || '-';
  const escapedName = escapeHtml(name);

  let toggleBtn = '';
  if (isProduct) {
    if (row.variants && row.variants.length > 0) {
      const caret = isCollapsedOrParentCollapsed ? '▶' : '▼';
      toggleBtn = `<button class="toggle-variants-btn" data-product-id="${escapeHtml(productId)}" aria-label="Thu gọn/mở rộng phân loại">${caret}</button> `;
    } else {
      toggleBtn = `<span class="toggle-placeholder"></span>`;
    }
  }

  const hiddenStyle = (!isProduct && isCollapsedOrParentCollapsed) ? 'style="display: none;"' : '';

  return `
    <tr class="${rowClass}" ${hiddenStyle} data-product-id="${escapeHtml(productId)}">
      <td>${toggleBtn}${escapeHtml(displayCode || '-')}</td>
      <td class="name-cell">
        <span class="name-ellipsis" title="${escapedName}">${escapedName}</span>
      </td>
      <td>${formatCurrency(row.lastRevenue)}</td>
      <td>${formatCurrency(row.thisRevenue)}</td>
      <td>${formatCurrency(row.trendingRevenue)}</td>
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

function updateTargetDisplay(targetVal) {
  const textEl = document.getElementById('targetValueText');
  if (textEl) {
    textEl.textContent = targetVal > 0 ? `${formatTargetInput(targetVal)} ₫` : 'Chưa đặt';
  }
}

function enterTargetEditMode() {
  const viewModeEl = document.getElementById('targetViewMode');
  const editModeEl = document.getElementById('targetEditMode');
  if (viewModeEl && editModeEl) {
    viewModeEl.style.display = 'none';
    editModeEl.style.display = 'flex';
    if (dashboardTargetInput) {
      originalTargetInputValue = dashboardTargetInput.value;
      dashboardTargetInput.focus();
      dashboardTargetInput.select();
    }
  }
}

function exitTargetEditMode(save = true) {
  const viewModeEl = document.getElementById('targetViewMode');
  const editModeEl = document.getElementById('targetEditMode');
  
  if (viewModeEl && editModeEl) {
    if (save) {
      const numericVal = parseTargetValue(dashboardTargetInput.value);
      try {
        localStorage.setItem(TARGET_STORAGE_KEY, String(numericVal));
      } catch (err) {}
      syncTargetToUrlHash(numericVal);
      updateTrendingVsTargetComparison();
    } else {
      if (dashboardTargetInput) {
        dashboardTargetInput.value = originalTargetInputValue;
      }
    }
    
    viewModeEl.style.display = 'flex';
    editModeEl.style.display = 'none';
  }
}

function initTarget() {
  let targetVal = 0;
  
  const urlTarget = getTargetFromUrl();
  if (urlTarget !== null) {
    targetVal = urlTarget;
    try {
      localStorage.setItem(TARGET_STORAGE_KEY, String(targetVal));
    } catch (e) {
      console.warn('Không lưu được target vào localStorage:', e);
    }
  } else {
    try {
      const saved = localStorage.getItem(TARGET_STORAGE_KEY);
      if (saved !== null) {
        targetVal = parseInt(saved, 10) || 0;
      }
    } catch (e) {
      console.warn('Không đọc được target từ localStorage:', e);
    }
  }

  if (dashboardTargetInput) {
    dashboardTargetInput.value = formatTargetInput(targetVal);
  }
  
  syncTargetToUrlHash(targetVal);
  updateTrendingVsTargetComparison();
}

function getTargetFromUrl() {
  try {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.has('target')) {
      const val = parseInt(hashParams.get('target'), 10);
      return isNaN(val) ? null : val;
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('target')) {
      const val = parseInt(urlParams.get('target'), 10);
      return isNaN(val) ? null : val;
    }
  } catch (e) {
    console.error('Lỗi khi đọc target từ URL:', e);
  }
  return null;
}

function syncTargetToUrlHash(targetVal) {
  try {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (targetVal > 0) {
      hashParams.set('target', String(targetVal));
    } else {
      hashParams.delete('target');
    }
    const newHash = hashParams.toString();
    const newHashStr = newHash ? `#${newHash}` : '#';
    if (window.location.hash !== newHashStr) {
      history.replaceState(null, document.title, window.location.pathname + window.location.search + (newHash ? `#${newHash}` : ''));
    }
  } catch (e) {
    console.error('Lỗi khi đồng bộ hash URL:', e);
  }
}

function parseTargetValue(valueStr) {
  if (!valueStr) return 0;
  const clean = String(valueStr).replace(/[^\d]/g, '');
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function formatTargetInput(value) {
  if (!value) return '0';
  return Math.round(value).toLocaleString('vi-VN');
}

function updateTrendingVsTargetComparison() {
  if (!trendingVsTargetEl) return;
  
  const targetVal = dashboardTargetInput ? parseTargetValue(dashboardTargetInput.value) : 0;
  updateTargetDisplay(targetVal);

  if (targetVal <= 0) {
    trendingVsTargetEl.textContent = 'Chưa đặt';
    trendingVsTargetEl.className = 'change-flat';
    return;
  }

  const diff = latestTrendingTotal - targetVal;
  const percent = (diff / targetVal) * 100;
  
  trendingVsTargetEl.textContent = formatPercent(percent);
  trendingVsTargetEl.className = getChangeClass(diff);
}

function handleTargetInput(e) {
  const input = e.target;
  let val = input.value;
  
  let cursorPosition = input.selectionStart;
  const originalLength = val.length;
  
  const cleanVal = val.replace(/[^\d]/g, '');
  if (!cleanVal) {
    input.value = '';
    return;
  }
  
  const numericVal = parseInt(cleanVal, 10);
  const formattedVal = numericVal.toLocaleString('vi-VN');
  
  input.value = formattedVal;
  
  const newLength = formattedVal.length;
  const lengthDiff = newLength - originalLength;
  
  let newCursorPos = cursorPosition + lengthDiff;
  newCursorPos = Math.max(0, Math.min(newCursorPos, newLength));
  input.setSelectionRange(newCursorPos, newCursorPos);
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
