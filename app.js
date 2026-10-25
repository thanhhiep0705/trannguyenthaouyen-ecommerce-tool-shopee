const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
const dashboardStatusEl = document.getElementById('dashboardStatus');
const lastMonthTotalEl = document.getElementById('lastMonthTotal');
const thisMonthTotalEl = document.getElementById('thisMonthTotal');
const thisMonthTrendingEl = document.getElementById('thisMonthTrending');
const dashboardChangeEl = document.getElementById('dashboardChange');
const revenueTreeBody = document.getElementById('revenueTreeBody');
const dashboardSearchInput = document.getElementById('dashboardSearch');
const searchSummaryBar = document.getElementById('searchSummaryBar');
const searchTotalLastMonthEl = document.getElementById('searchTotalLastMonth');
const searchTotalThisMonthEl = document.getElementById('searchTotalThisMonth');
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
const LAST_MONTH_REVENUE_SHEET = 'Last Month';
const THIS_MONTH_REVENUE_SHEET = 'This Month';

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

initMonthLabels();
initTarget();
handleDashboard();

function initMonthLabels() {
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const currentMonthIdx = now.getMonth();
  const lastMonthIdx = (currentMonthIdx + 11) % 12;

  const thisMonthName = MONTH_NAMES[currentMonthIdx];
  const lastMonthName = MONTH_NAMES[lastMonthIdx];

  const labelLastMonth = document.getElementById('labelLastMonthName');
  if (labelLastMonth) labelLastMonth.textContent = lastMonthName;

  const labelThisMonth = document.getElementById('labelThisMonthName');
  if (labelThisMonth) labelThisMonth.textContent = thisMonthName;

  const sectionSortMonth = document.getElementById('sectionSortMonthName');
  if (sectionSortMonth) sectionSortMonth.textContent = thisMonthName;

  const searchLastMonth = document.getElementById('searchSummaryLastMonthLabel');
  if (searchLastMonth) searchLastMonth.textContent = `${lastMonthName}:`;

  const searchThisMonth = document.getElementById('searchSummaryThisMonthLabel');
  if (searchThisMonth) searchThisMonth.textContent = `${thisMonthName}:`;

  const thLastMonth = document.getElementById('thLastMonthLabel');
  if (thLastMonth) thLastMonth.textContent = lastMonthName;

  const thThisMonth = document.getElementById('thThisMonthLabel');
  if (thThisMonth) thThisMonth.textContent = thisMonthName;
}

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
    let totalLastMonth = 0;
    let totalThisMonth = 0;
    let totalTrending = 0;

    filteredProducts.forEach(product => {
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
          totalLastMonth += variant.lastRevenue || 0;
          totalThisMonth += variant.thisRevenue || 0;
          totalTrending += variant.trendingRevenue || 0;
        });
      } else {
        totalLastMonth += product.lastRevenue || 0;
        totalThisMonth += product.thisRevenue || 0;
        totalTrending += product.trendingRevenue || 0;
      }
    });

    const diff = totalTrending - totalLastMonth;
    const percent = totalLastMonth === 0 ? (totalTrending === 0 ? 0 : null) : (diff / totalLastMonth) * 100;

    searchTotalLastMonthEl.textContent = formatCurrency(totalLastMonth);
    searchTotalThisMonthEl.textContent = formatCurrency(totalThisMonth);
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

/* ==========================================================================
   Tab Navigation & Stock Monitor Logic
   ========================================================================== */

const STOCK_SHEET = 'Follow STOCK';
const STOCK_THRESHOLDS_KEY = 'miSalesStockThresholds';

const tabButtons = document.querySelectorAll('.app-header .tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

const refreshStockBtn = document.getElementById('refreshStockBtn');
const stockStatusEl = document.getElementById('stockStatus');
const stockMonthLabelBadge = document.getElementById('stockMonthLabelBadge');

const stockConfigBtn = document.getElementById('stockConfigBtn');
const exportStockExcelBtn = document.getElementById('exportStockExcelBtn');
const stockThresholdPanel = document.getElementById('stockThresholdPanel');
const closeStockConfigBtn = document.getElementById('closeStockConfigBtn');
const cancelStockConfigBtn = document.getElementById('cancelStockConfigBtn');
const saveStockThresholdsBtn = document.getElementById('saveStockThresholdsBtn');
const resetStockThresholdsBtn = document.getElementById('resetStockThresholdsBtn');
const inputDangerDays = document.getElementById('inputDangerDays');
const inputWarningDays = document.getElementById('inputWarningDays');
const hintSafeVal = document.getElementById('hintSafeVal');

const labelCardDangerDays = document.getElementById('labelCardDangerDays');
const labelCardWarningRange = document.getElementById('labelCardWarningRange');
const labelCardSafeDays = document.getElementById('labelCardSafeDays');

const stockCountOOSEl = document.getElementById('stockCountOOS');
const stockCountDangerEl = document.getElementById('stockCountDanger');
const stockCountWarningEl = document.getElementById('stockCountWarning');
const stockCountSafeEl = document.getElementById('stockCountSafe');
const stockTotalRevenueEl = document.getElementById('stockTotalRevenue');
const stockTotalSKUEl = document.getElementById('stockTotalSKU');

const pillCountAll = document.getElementById('pillCountAll');
const pillCountOOS = document.getElementById('pillCountOOS');
const pillCountDanger = document.getElementById('pillCountDanger');
const pillCountWarning = document.getElementById('pillCountWarning');
const pillCountSafe = document.getElementById('pillCountSafe');

const stockFilterPills = document.querySelectorAll('.stock-filter-pill');
const stockSummaryCards = document.querySelectorAll('.stock-summary .metric[data-stock-filter]');
const stockSearchInput = document.getElementById('stockSearchInput');

const stockFilterInfoBar = document.getElementById('stockFilterInfoBar');
const stockFilteredCountEl = document.getElementById('stockFilteredCount');
const stockFilteredTotalEl = document.getElementById('stockFilteredTotal');
const stockFilteredTotalStockEl = document.getElementById('stockFilteredTotalStock');
const stockFilteredTotalRevenueEl = document.getElementById('stockFilteredTotalRevenue');
const stockResetFilterBtn = document.getElementById('stockResetFilterBtn');

const stockTableBody = document.getElementById('stockTableBody');
const stockSortableHeaders = document.querySelectorAll('.stock-sortable');

let stockItems = [];
let stockLoaded = false;
let stockFilter = 'all';
let stockSearchQuery = '';
let stockSortColumn = 'priority';
let stockSortDirection = 'asc';
let stockMonthLabel = 'Oct 2026';

let stockDangerDays = 14;
let stockWarningDays = 30;

// Initialize custom thresholds from localStorage
loadStockThresholds();

// Tab switching
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetPanelId = btn.dataset.tab;
    if (!targetPanelId) return;

    tabButtons.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const targetPanel = document.getElementById(targetPanelId);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    if (targetPanelId === 'stockPanel' && !stockLoaded) {
      handleStock();
    }
  });
});

if (refreshStockBtn) {
  refreshStockBtn.addEventListener('click', handleStock);
}

// Config Panel Events
if (stockConfigBtn && stockThresholdPanel) {
  stockConfigBtn.addEventListener('click', () => {
    const isHidden = stockThresholdPanel.style.display === 'none';
    stockThresholdPanel.style.display = isHidden ? 'block' : 'none';
    stockConfigBtn.classList.toggle('active', isHidden);
    if (isHidden) {
      if (inputDangerDays) inputDangerDays.value = stockDangerDays;
      if (inputWarningDays) inputWarningDays.value = stockWarningDays;
      updateConfigPanelHints();
    }
  });
}

function closeStockConfig() {
  if (stockThresholdPanel) stockThresholdPanel.style.display = 'none';
  if (stockConfigBtn) stockConfigBtn.classList.remove('active');
  if (inputDangerDays) inputDangerDays.value = stockDangerDays;
  if (inputWarningDays) inputWarningDays.value = stockWarningDays;
  updateConfigPanelHints();
}

if (closeStockConfigBtn) closeStockConfigBtn.addEventListener('click', closeStockConfig);
if (cancelStockConfigBtn) cancelStockConfigBtn.addEventListener('click', closeStockConfig);

function updateConfigPanelHints() {
  const w = parseInt(inputWarningDays ? inputWarningDays.value : stockWarningDays, 10) || stockWarningDays;
  if (hintSafeVal) {
    hintSafeVal.textContent = `> ${w} ngày`;
  }
}

if (inputDangerDays) inputDangerDays.addEventListener('input', updateConfigPanelHints);
if (inputWarningDays) inputWarningDays.addEventListener('input', updateConfigPanelHints);

if (saveStockThresholdsBtn) {
  saveStockThresholdsBtn.addEventListener('click', () => {
    const d = parseInt(inputDangerDays.value, 10);
    const w = parseInt(inputWarningDays.value, 10);

    if (isNaN(d) || d < 1) {
      alert('Ngưỡng nguy hiểm phải là số nguyên ≥ 1 ngày.');
      inputDangerDays.focus();
      return;
    }

    if (isNaN(w) || w <= d) {
      alert(`Ngưỡng cảnh báo phải lớn hơn ngưỡng nguy hiểm (phải > ${d} ngày).`);
      inputWarningDays.focus();
      return;
    }

    stockDangerDays = d;
    stockWarningDays = w;

    try {
      localStorage.setItem(STOCK_THRESHOLDS_KEY, JSON.stringify({ danger: d, warning: w }));
    } catch (e) {
      console.error('Không lưu được thresholds:', e);
    }

    updateThresholdLabels();

    // Re-classify all items with new thresholds
    stockItems.forEach(item => classifyStockItem(item));

    renderStockSummary();
    renderStockTable();
    closeStockConfig();

    setStockStatus(`Đã áp dụng điều kiện mới: Nguy hiểm ≤ ${stockDangerDays} ngày, Cảnh báo ≤ ${stockWarningDays} ngày.`);
    setTimeout(() => {
      if (stockStatusEl && stockStatusEl.textContent.includes('Đã áp dụng điều kiện mới')) {
        setStockStatus('');
      }
    }, 3500);
  });
}

if (resetStockThresholdsBtn) {
  resetStockThresholdsBtn.addEventListener('click', () => {
    stockDangerDays = 14;
    stockWarningDays = 30;
    if (inputDangerDays) inputDangerDays.value = 14;
    if (inputWarningDays) inputWarningDays.value = 30;

    try {
      localStorage.removeItem(STOCK_THRESHOLDS_KEY);
    } catch (e) {}

    updateThresholdLabels();
    stockItems.forEach(item => classifyStockItem(item));
    renderStockSummary();
    renderStockTable();
    closeStockConfig();

    setStockStatus('Đã khôi phục ngưỡng mặc định: 14 ngày (Nguy hiểm), 30 ngày (Cảnh báo).');
    setTimeout(() => {
      if (stockStatusEl && stockStatusEl.textContent.includes('Đã khôi phục ngưỡng mặc định')) {
        setStockStatus('');
      }
    }, 3500);
  });
}

// Export Excel button
if (exportStockExcelBtn) {
  exportStockExcelBtn.addEventListener('click', exportStockToExcel);
}

function loadStockThresholds() {
  try {
    const saved = localStorage.getItem(STOCK_THRESHOLDS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.danger === 'number' && typeof parsed.warning === 'number') {
        if (parsed.danger >= 1 && parsed.warning > parsed.danger) {
          stockDangerDays = parsed.danger;
          stockWarningDays = parsed.warning;
        }
      }
    }
  } catch (e) {
    console.error('Lỗi đọc stock thresholds từ localStorage:', e);
  }

  if (inputDangerDays) inputDangerDays.value = stockDangerDays;
  if (inputWarningDays) inputWarningDays.value = stockWarningDays;
  updateThresholdLabels();
}

function updateThresholdLabels() {
  if (labelCardDangerDays) labelCardDangerDays.textContent = stockDangerDays;
  if (labelCardWarningRange) labelCardWarningRange.textContent = `${stockDangerDays + 1}–${stockWarningDays}`;
  if (labelCardSafeDays) labelCardSafeDays.textContent = stockWarningDays;
  if (hintSafeVal) hintSafeVal.textContent = `> ${stockWarningDays} ngày`;
}

// Filter pills
stockFilterPills.forEach(pill => {
  pill.addEventListener('click', () => {
    setStockFilter(pill.dataset.filter);
  });
});

// Summary card click to filter
stockSummaryCards.forEach(card => {
  card.addEventListener('click', () => {
    const target = card.dataset.stockFilter;
    if (stockFilter === target) {
      setStockFilter('all');
    } else {
      setStockFilter(target);
    }
  });
});

// Search input
if (stockSearchInput) {
  stockSearchInput.addEventListener('input', e => {
    stockSearchQuery = e.target.value.trim().toLowerCase();
    renderStockTable();
  });
}

// Reset filter
if (stockResetFilterBtn) {
  stockResetFilterBtn.addEventListener('click', () => {
    if (stockSearchInput) stockSearchInput.value = '';
    stockSearchQuery = '';
    setStockFilter('all');
  });
}

// Sort headers
stockSortableHeaders.forEach(header => {
  header.addEventListener('click', () => {
    const col = header.dataset.stockSort;
    if (!col) return;

    if (stockSortColumn === col) {
      stockSortDirection = stockSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      stockSortColumn = col;
      stockSortDirection = (col === 'sku' || col === 'oosdays' || col === 'status') ? 'asc' : 'desc';
    }

    renderStockTable();
  });
});

function setStockFilter(filterKey) {
  stockFilter = filterKey || 'all';

  // Update pills active state
  stockFilterPills.forEach(pill => {
    pill.classList.toggle('active', pill.dataset.filter === stockFilter);
  });

  // Update cards active state
  stockSummaryCards.forEach(card => {
    card.classList.toggle('filter-active', card.dataset.stockFilter === stockFilter);
  });

  renderStockTable();
}

function setStockStatus(message, type = '') {
  if (!stockStatusEl) return;
  stockStatusEl.textContent = message;
  stockStatusEl.className = type ? `status dashboard-status ${type}` : 'status dashboard-status';
  stockStatusEl.style.display = message ? 'block' : 'none';
}

async function handleStock() {
  try {
    setStockStatus('Đang tải dữ liệu tồn kho từ sheet "Follow STOCK"...', '');
    if (refreshStockBtn) refreshStockBtn.disabled = true;

    const rows = await loadGoogleSheetRows({ sheetName: STOCK_SHEET });
    parseStockRows(rows);
    stockLoaded = true;

    renderStockSummary();
    renderStockTable();
    setStockStatus('');
  } catch (error) {
    console.error('Lỗi tải dữ liệu tồn kho:', error);
    setStockStatus(`Không tải được sheet "${STOCK_SHEET}": ${error.message}`, 'error');
    if (stockTableBody) {
      stockTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 24px;">Lỗi tải dữ liệu: ${escapeHtml(error.message)}</td></tr>`;
    }
  } finally {
    if (refreshStockBtn) refreshStockBtn.disabled = false;
  }
}

function classifyStockItem(item) {
  if (item.stock === 0 || item.oosDays === 0) {
    item.status = 'oos';
    item.statusLabel = 'Hết hàng';
    item.statusPriority = 1;
  } else if (item.oosDays !== null && item.oosDays <= stockDangerDays) {
    item.status = 'danger';
    item.statusLabel = 'Nguy hiểm';
    item.statusPriority = 2;
  } else if (item.oosDays !== null && item.oosDays <= stockWarningDays) {
    item.status = 'warning';
    item.statusLabel = 'Cảnh báo';
    item.statusPriority = 3;
  } else {
    item.status = 'safe';
    item.statusLabel = 'An toàn';
    item.statusPriority = 4;
  }
}

function parseStockRows(rows) {
  stockItems = [];
  if (!Array.isArray(rows) || rows.length === 0) return;

  // Header row may contain month context in col 7
  const headerRow = rows[0] || [];
  if (headerRow[7] && typeof headerRow[7] === 'string' && headerRow[7].trim()) {
    stockMonthLabel = headerRow[7].trim();
  } else {
    stockMonthLabel = 'Oct 2026';
  }

  if (stockMonthLabelBadge) {
    stockMonthLabelBadge.textContent = stockMonthLabel;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const sku = String(row[0]).trim();
    if (!sku || sku === 'SKU' || sku.toLowerCase() === 'grand total') continue;

    const revenue = parseOptionalNumber(row[1]) || 0;
    const soldMonth = parseOptionalNumber(row[2]) || 0;
    const stock = parseOptionalNumber(row[3]) || 0;

    const rawOos = row[4] !== undefined && row[4] !== null ? String(row[4]).trim() : '';
    const isNa = rawOos.toUpperCase().includes('N/A');
    let oosDays = null;
    if (!isNa) {
      const match = rawOos.match(/(\d+)/);
      if (match) {
        oosDays = parseInt(match[1], 10);
      }
    }

    const rateDay = parseOptionalNumber(row[5]) || 0;
    const rateMonth = parseOptionalNumber(row[6]) || 0;

    const item = {
      sku,
      revenue,
      soldMonth,
      stock,
      oosDays,
      rawOos,
      isNa,
      rateDay,
      rateMonth,
      status: 'safe',
      statusLabel: 'An toàn',
      statusPriority: 4
    };

    classifyStockItem(item);
    stockItems.push(item);
  }
}

function renderStockSummary() {
  const total = stockItems.length;
  let oosCount = 0;
  let dangerCount = 0;
  let warningCount = 0;
  let safeCount = 0;
  let totalRevenue = 0;

  stockItems.forEach(item => {
    if (item.status === 'oos') oosCount++;
    else if (item.status === 'danger') dangerCount++;
    else if (item.status === 'warning') warningCount++;
    else if (item.status === 'safe') safeCount++;

    totalRevenue += item.revenue;
  });

  if (stockCountOOSEl) stockCountOOSEl.textContent = formatCurrency(oosCount);
  if (stockCountDangerEl) stockCountDangerEl.textContent = formatCurrency(dangerCount);
  if (stockCountWarningEl) stockCountWarningEl.textContent = formatCurrency(warningCount);
  if (stockCountSafeEl) stockCountSafeEl.textContent = formatCurrency(safeCount);
  if (stockTotalRevenueEl) stockTotalRevenueEl.textContent = `${formatCurrency(totalRevenue)} ₫`;
  if (stockTotalSKUEl) stockTotalSKUEl.textContent = formatCurrency(total);

  if (pillCountAll) pillCountAll.textContent = formatCurrency(total);
  if (pillCountOOS) pillCountOOS.textContent = formatCurrency(oosCount);
  if (pillCountDanger) pillCountDanger.textContent = formatCurrency(dangerCount);
  if (pillCountWarning) pillCountWarning.textContent = formatCurrency(warningCount);
  if (pillCountSafe) pillCountSafe.textContent = formatCurrency(safeCount);
}

function renderStockTable() {
  if (!stockTableBody) return;

  // 1. Filter
  let filtered = stockItems.filter(item => {
    if (stockFilter !== 'all' && item.status !== stockFilter) {
      return false;
    }
    if (stockSearchQuery && !item.sku.toLowerCase().includes(stockSearchQuery)) {
      return false;
    }
    return true;
  });

  // 2. Info Bar
  const isFiltered = stockFilter !== 'all' || Boolean(stockSearchQuery);
  if (stockFilterInfoBar) {
    if (isFiltered) {
      stockFilterInfoBar.style.display = 'flex';
      const filteredStock = filtered.reduce((sum, item) => sum + item.stock, 0);
      const filteredRevenue = filtered.reduce((sum, item) => sum + item.revenue, 0);

      if (stockFilteredCountEl) stockFilteredCountEl.textContent = formatCurrency(filtered.length);
      if (stockFilteredTotalEl) stockFilteredTotalEl.textContent = formatCurrency(stockItems.length);
      if (stockFilteredTotalStockEl) stockFilteredTotalStockEl.textContent = formatCurrency(filteredStock);
      if (stockFilteredTotalRevenueEl) stockFilteredTotalRevenueEl.textContent = `${formatCurrency(filteredRevenue)} ₫`;
    } else {
      stockFilterInfoBar.style.display = 'none';
    }
  }

  // 3. Sort
  filtered.sort((a, b) => {
    let result = 0;
    if (stockSortColumn === 'priority') {
      if (a.statusPriority !== b.statusPriority) {
        result = a.statusPriority - b.statusPriority;
      } else {
        const daysA = a.oosDays !== null ? a.oosDays : 999999;
        const daysB = b.oosDays !== null ? b.oosDays : 999999;
        result = daysA - daysB;
      }
      return stockSortDirection === 'desc' ? -result : result;
    }

    switch (stockSortColumn) {
      case 'sku':
        result = a.sku.localeCompare(b.sku);
        break;
      case 'stock':
        result = a.stock - b.stock;
        break;
      case 'soldMonth':
        result = a.soldMonth - b.soldMonth;
        break;
      case 'rateDay':
        result = a.rateDay - b.rateDay;
        break;
      case 'rateMonth':
        result = a.rateMonth - b.rateMonth;
        break;
      case 'oosdays': {
        const daysA = a.oosDays !== null ? a.oosDays : 999999;
        const daysB = b.oosDays !== null ? b.oosDays : 999999;
        result = daysA - daysB;
        break;
      }
      case 'revenue':
        result = a.revenue - b.revenue;
        break;
      case 'status':
        result = a.statusPriority - b.statusPriority;
        break;
      default:
        result = 0;
    }

    return stockSortDirection === 'desc' ? -result : result;
  });

  // Update Sort Header Icons
  stockSortableHeaders.forEach(header => {
    const col = header.dataset.stockSort;
    const iconSpan = header.querySelector('.sort-icon');
    if (!iconSpan) return;

    if (col === stockSortColumn) {
      iconSpan.textContent = stockSortDirection === 'asc' ? ' ▲' : ' ▼';
      iconSpan.style.color = 'var(--brand)';
    } else {
      iconSpan.textContent = ' ↕';
      iconSpan.style.color = '';
    }
  });

  // 4. Render Table Rows
  if (filtered.length === 0) {
    stockTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px; color: var(--muted);">
          Không tìm thấy SKU nào phù hợp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  const maxBarScale = Math.max(stockWarningDays * 2, 60);

  const rowsHtml = filtered.map(item => {
    // Days text and progress bar calculation
    let daysText = '';
    let barClass = '';
    let barPercent = 0;

    if (item.status === 'oos') {
      daysText = `<span class="oos-text oos-text-danger">0 ngày (Hết hàng)</span>`;
      barClass = 'fill-oos';
      barPercent = 100;
    } else if (item.status === 'danger') {
      daysText = `<span class="oos-text oos-text-danger">${item.oosDays} ngày</span>`;
      barClass = 'fill-danger';
      barPercent = Math.max(10, Math.min(100, Math.round((item.oosDays / maxBarScale) * 100)));
    } else if (item.status === 'warning') {
      daysText = `<span class="oos-text oos-text-warning">${item.oosDays} ngày</span>`;
      barClass = 'fill-warning';
      barPercent = Math.max(15, Math.min(100, Math.round((item.oosDays / maxBarScale) * 100)));
    } else if (item.isNa) {
      daysText = `<span class="oos-text oos-text-muted">N/A (Chưa bán)</span>`;
      barClass = 'fill-na';
      barPercent = 100;
    } else {
      daysText = `<span class="oos-text oos-text-safe">${item.oosDays} ngày</span>`;
      barClass = 'fill-safe';
      barPercent = Math.min(100, Math.max(20, Math.round((item.oosDays / maxBarScale) * 100)));
    }

    return `
      <tr class="stock-row-${item.status}">
        <td><strong>${escapeHtml(item.sku)}</strong></td>
        <td class="numeric-cell"><span class="${item.stock === 0 ? 'text-danger font-bold' : ''}">${formatCurrency(item.stock)}</span></td>
        <td class="numeric-cell">${formatCurrency(item.soldMonth)}</td>
        <td class="numeric-cell">${formatCurrency(item.rateDay)}</td>
        <td class="numeric-cell">${formatCurrency(item.rateMonth)}</td>
        <td>
          <div class="stock-oos-cell">
            <div class="stock-oos-header">
              ${daysText}
            </div>
            <div class="stock-progress-track">
              <div class="stock-progress-fill ${barClass}" style="width: ${barPercent}%;"></div>
            </div>
          </div>
        </td>
        <td class="numeric-cell font-bold">${formatCurrency(item.revenue)} ₫</td>
        <td>
          <span class="stock-badge badge-${item.status}">
            ${item.status === 'oos' ? '🔴' : item.status === 'danger' ? '🟠' : item.status === 'warning' ? '🟡' : '🟢'} ${item.statusLabel}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  stockTableBody.innerHTML = rowsHtml;
}

function exportStockToExcel() {
  if (!stockItems || stockItems.length === 0) {
    alert('Chưa có dữ liệu tồn kho để xuất. Vui lòng đợi dữ liệu tải xong hoặc bấm "Cập nhật".');
    return;
  }

  // Filter items if user has filter or search active
  let itemsToExport = stockItems.filter(item => {
    if (stockFilter !== 'all' && item.status !== stockFilter) {
      return false;
    }
    if (stockSearchQuery && !item.sku.toLowerCase().includes(stockSearchQuery)) {
      return false;
    }
    return true;
  });

  if (itemsToExport.length === 0) {
    itemsToExport = stockItems;
  }

  const exportRows = itemsToExport.map((item, idx) => ({
    'STT': idx + 1,
    'Mã SKU': item.sku,
    'Tồn kho hiện tại': item.stock,
    'Đã bán tháng': item.soldMonth,
    'Tốc độ bán/ngày': item.rateDay,
    'Trending bán/tháng': item.rateMonth,
    'Ngày còn hàng (OOS)': item.status === 'oos' ? 0 : (item.isNa ? 'N/A' : item.oosDays),
    'Doanh thu tháng (VNĐ)': item.revenue,
    'Trạng thái': item.statusLabel,
    'Khuyến nghị xử lý': item.status === 'oos'
      ? 'Hết hàng - Đặt hàng khẩn cấp'
      : item.status === 'danger'
      ? `Nguy hiểm - Còn ≤ ${stockDangerDays} ngày`
      : item.status === 'warning'
      ? `Cảnh báo - Còn ≤ ${stockWarningDays} ngày`
      : `An toàn (> ${stockWarningDays} ngày)`
  }));

  const safeMonthName = (stockMonthLabel || 'Oct_2026').replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `Follow_STOCK_${safeMonthName}_${dateStr}`;

  // 1. Try Native XLSX export via SheetJS
  if (window.XLSX && window.XLSX.utils) {
    try {
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 18 },
        { wch: 16 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 22 },
        { wch: 15 },
        { wch: 35 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Follow STOCK");
      XLSX.writeFile(wb, `${fileName}.xlsx`);

      setStockStatus(`Đã xuất thành công ${exportRows.length} SKU ra file ${fileName}.xlsx!`);
      setTimeout(() => {
        if (stockStatusEl && stockStatusEl.textContent.includes('Đã xuất thành công')) {
          setStockStatus('');
        }
      }, 4000);
      return;
    } catch (err) {
      console.warn('Lỗi xuất với SheetJS, chuyển sang CSV:', err);
    }
  }

  // 2. Fallback to UTF-8 BOM CSV (opens seamlessly in Excel with Vietnamese characters)
  try {
    const headers = Object.keys(exportRows[0]);
    const csvLines = [headers.join(',')];
    exportRows.forEach(row => {
      const line = headers.map(h => `"${String(row[h] !== undefined && row[h] !== null ? row[h] : '').replace(/"/g, '""')}"`).join(',');
      csvLines.push(line);
    });
    const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setStockStatus(`Đã xuất thành công ${exportRows.length} SKU ra file ${fileName}.csv!`);
    setTimeout(() => {
      if (stockStatusEl && stockStatusEl.textContent.includes('Đã xuất thành công')) {
        setStockStatus('');
      }
    }, 4000);
  } catch (err) {
    console.error('Lỗi khi xuất file:', err);
    alert('Có lỗi khi tạo file xuất: ' + err.message);
  }
}

