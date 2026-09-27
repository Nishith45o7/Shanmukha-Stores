/**
 * Shanmukha Stores - Background Catalog Search & Filter Web Worker
 * Offloads sorting and search computations from the browser main thread
 */

self.onmessage = function (e) {
  var payload = e.data || {};
  var type = payload.type;
  var products = payload.products || [];
  var query = (payload.query || '').trim().toLowerCase();
  var sortKey = payload.sortKey;

  if (type === 'FILTER_AND_SORT') {
    var filtered = products;

    if (query) {
      filtered = filtered.filter(function (p) {
        var nameMatch = p.name && p.name.toLowerCase().indexOf(query) !== -1;
        var catMatch = p.category_name && p.category_name.toLowerCase().indexOf(query) !== -1;
        var descMatch = p.description && p.description.toLowerCase().indexOf(query) !== -1;
        return nameMatch || catMatch || descMatch;
      });
    }

    if (sortKey === 'price-low') {
      filtered.sort(function (a, b) {
        return Number(a.effective_price || a.price || 0) - Number(b.effective_price || b.price || 0);
      });
    } else if (sortKey === 'price-high') {
      filtered.sort(function (a, b) {
        return Number(b.effective_price || b.price || 0) - Number(a.effective_price || a.price || 0);
      });
    } else if (sortKey === 'name') {
      filtered.sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
    }

    self.postMessage({
      type: 'RESULTS',
      data: filtered,
      count: filtered.length
    });
  }
};
