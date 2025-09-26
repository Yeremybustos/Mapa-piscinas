// script.js
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar mapa con vista por defecto
  const defaultCenter = [9.7, -85.1];
  const map = L.map('map').setView(defaultCenter, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // UI elementos
  const toggleFormBtn = document.getElementById('toggleForm');
  const formPanel = document.getElementById('formPanel');
  const closeFormBtn = document.getElementById('closeForm');
  const clientForm = document.getElementById('clientForm');
  const clientListEl = document.getElementById('clientList');
  const listPanel = document.getElementById('listPanel');
  const searchInput = document.getElementById('search');
  const exportBtn = document.getElementById('exportBtn');
  const toggleListBtn = document.getElementById('toggleList');
  const clearAllBtn = document.getElementById('clearAll');

  // Datos y marcadores
  let clients = JSON.parse(localStorage.getItem('clients') || '[]');
  const markers = new Map(); // id -> marker

  // Routing y seguimiento en tiempo real
  let routingControl = null;
  let followWatchId = null;
  let lastFollowPos = null;
  const FOLLOW_MIN_MOVE_METERS = 15; // ajustar si se desea

  // Corregir tamaño si el mapa se creó en contenedor oculto
  setTimeout(() => map.invalidateSize(), 250);

  // Intentar geolocalización inicial (muestra ubicación)
  let lastKnownPosition = null;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      lastKnownPosition = [latitude, longitude];
      L.marker([latitude, longitude]).addTo(map).bindPopup('Tu ubicación').openPopup();
      map.setView([latitude, longitude], 14);
    }, err => {
      console.warn('Geoloc error:', err && err.message);
    }, { maximumAge: 60000, timeout: 5000 });
  }

  // Renderizar marcadores guardados
  clients.forEach(c => createMarker(c));
  updateListUI();

  // Mostrar/ocultar formulario
  toggleFormBtn.addEventListener('click', () => {
    formPanel.classList.toggle('hidden');
    if (!formPanel.classList.contains('hidden')) {
      setTimeout(() => map.invalidateSize(), 200);
      document.getElementById('name').focus();
    }
  });

  closeFormBtn.addEventListener('click', () => {
    formPanel.classList.add('hidden');
  });

  // Mostrar/ocultar lista
  toggleListBtn.addEventListener('click', () => {
    listPanel.classList.toggle('hidden');
    if (!listPanel.classList.contains('hidden')) setTimeout(() => map.invalidateSize(), 200);
  });

  document.getElementById('closeList').addEventListener('click', () => {
    listPanel.classList.add('hidden');
  });

  // Buscar clientes (filtra lista y abre panel)
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    updateListUI(q);
    if (q) listPanel.classList.remove('hidden');
  });

  // Guardar cliente (geocodificación con Nominatim)
  clientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const address = document.getElementById('address').value.trim();
    if (!name || !address) return;

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      const data = await resp.json();
      if (!data || data.length === 0) {
        alert('Dirección no encontrada. Intenta ser más específica (ej: calle, ciudad, país).');
        return;
      }

      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      const client = { id: Date.now(), name, address, lat, lon };

      clients.push(client);
      localStorage.setItem('clients', JSON.stringify(clients));

      createMarker(client);
      updateListUI();
      clientForm.reset();
      formPanel.classList.add('hidden');

      // Centrar y abrir
      map.setView([lat, lon], 16);
      const m = markers.get(client.id);
      if (m) m.openPopup();
    } catch (err) {
      console.error('Error geocodificando:', err);
      alert('Error al geocodificar la dirección. Revisa tu conexión e intenta de nuevo.');
    }
  });

  // Guardar haciendo click en mapa
  map.on('click', async (e) => {
    const { lat, lng } = e.latlng;
    const name = prompt('Nombre del cliente para esta ubicación (Cancelar para abortar):');
    if (!name) return;

    let address = prompt('Dirección (opcional). Deja vacío para intentar obtenerla automáticamente:');

    if (!address) {
      try {
        const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const revResp = await fetch(revUrl, { headers: { 'Accept-Language': 'es' } });
        const revData = await revResp.json();
        if (revData && revData.display_name) {
          address = revData.display_name;
        } else {
          address = `Lat: ${lat.toFixed(6)}, Lon: ${lng.toFixed(6)}`;
        }
      } catch (err) {
        console.warn('Reverse geocoding failed:', err);
        address = `Lat: ${lat.toFixed(6)}, Lon: ${lng.toFixed(6)}`;
      }
    }

    const client = { id: Date.now(), name: name.trim(), address: address.trim(), lat, lon: lng };
    clients.push(client);
    localStorage.setItem('clients', JSON.stringify(clients));
    createMarker(client);
    updateListUI();

    map.setView([lat, lng], 16);
    const m = markers.get(client.id);
    if (m) m.openPopup();
  });

  // Crear marcador y guardarlo en Map
  function createMarker(client) {
    if (markers.has(client.id)) return;
    const m = L.marker([client.lat, client.lon]).addTo(map)
      .bindPopup(`<strong>${escapeHtml(client.name)}</strong><br>${escapeHtml(client.address)}<br><a href="https://www.google.com/maps?q=${client.lat},${client.lon}" target="_blank" rel="noopener">Abrir en Google Maps</a>`);
    markers.set(client.id, m);
  }

  // Actualizar lista de clientes (filtro opcional)
  function updateListUI(filter = '') {
    clientListEl.innerHTML = '';
    const filtered = clients.filter(c => (c.name + ' ' + c.address).toLowerCase().includes(filter.toLowerCase()));
    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No hay clientes';
      li.style.opacity = '0.6';
      clientListEl.appendChild(li);
      return;
    }
    filtered.forEach(c => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${escapeHtml(c.name)}</strong><div style="font-size:12px;color:#666">${escapeHtml(c.address)}</div>`;
      li.addEventListener('click', () => {
        map.setView([c.lat, c.lon], 16);
        const mk = markers.get(c.id);
        if (mk) mk.openPopup();
        listPanel.classList.add('hidden');
      });

      // Acciones: Cómo llegar, Copiar enlace, Eliminar
      const actions = document.createElement('div');
      actions.style.marginTop = '6px';
      actions.style.display = 'flex';
      actions.style.gap = '6px';

      const howBtn = document.createElement('button');
      howBtn.textContent = 'Cómo llegar';
      howBtn.style.fontSize = '12px';
      howBtn.style.padding = '6px';
      howBtn.style.cursor = 'pointer';
      howBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        startRouteToClient(c);
      });

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copiar enlace';
      copyBtn.style.fontSize = '12px';
      copyBtn.style.padding = '6px';
      copyBtn.style.cursor = 'pointer';
      copyBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const link = `${location.origin}${location.pathname}?lat=${c.lat}&lon=${c.lon}&name=${encodeURIComponent(c.name)}`;
        copyToClipboard(link);
        alert('Enlace copiado al portapapeles');
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Eliminar';
      delBtn.style.fontSize = '12px';
      delBtn.style.padding = '6px';
      delBtn.style.cursor = 'pointer';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (confirm(`Eliminar cliente "${c.name}"?`)) {
          removeClient(c.id);
        }
      });

      actions.appendChild(howBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(delBtn);
      li.appendChild(actions);

      clientListEl.appendChild(li);
    });
  }

  // Iniciar ruta hacia cliente con soporte de recálculo en tiempo real
  function startRouteToClient(client) {
    // Limpiar ruta anterior y botones
    if (routingControl) { map.removeControl(routingControl); routingControl = null; }
    if (followWatchId != null) { navigator.geolocation.clearWatch(followWatchId); followWatchId = null; lastFollowPos = null; }
    removeCancelRouteButton();
    removeFollowButton();

    if (!navigator.geolocation) {
      alert('Geolocalización no disponible en tu navegador.');
      return;
    }

    const waitingToast = showTemporaryMessage('Obteniendo tu ubicación...');

    navigator.geolocation.getCurrentPosition(pos => {
      hideTemporaryMessage(waitingToast);
      const start = L.latLng(pos.coords.latitude, pos.coords.longitude);
      lastKnownPosition = [pos.coords.latitude, pos.coords.longitude];
      lastFollowPos = start;
      const dest = L.latLng(client.lat, client.lon);

      // Crear routingControl con OSRM público
      routingControl = L.Routing.control({
        waypoints: [start, dest],
        router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
        showAlternatives: false,
        lineOptions: { styles: [{ color: '#2a9df4', opacity: 0.9, weight: 6 }] },
        createMarker: (i, wp) => {
          if (i === 0) return L.marker(wp.latLng).bindPopup('Tu ubicación');
          return L.marker(wp.latLng).bindPopup(`${escapeHtml(client.name)}<br>${escapeHtml(client.address)}`);
        },
        routeWhileDragging: false,
        fitSelectedRoute: true,
        show: false
      }).addTo(map);

      addCancelRouteButton();
      addFollowButton(client);

    }, err => {
      hideTemporaryMessage(waitingToast);
      alert('No se pudo obtener tu ubicación. Permite el acceso al GPS.');
      console.warn('Geolocation error:', err && err.message);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  // Botón para seguir en tiempo real
  function addFollowButton(client) {
    removeFollowButton();
    const btn = document.createElement('button');
    btn.id = 'followBtn';
    btn.textContent = 'Seguir en tiempo real';
    btn.addEventListener('click', () => {
      if (followWatchId != null) {
        navigator.geolocation.clearWatch(followWatchId);
        followWatchId = null;
        btn.textContent = 'Seguir en tiempo real';
        showTemporaryMessage('Seguimiento detenido', 1200);
      } else {
        startFollowPosition(client, btn);
      }
    });
    document.getElementById('controls').appendChild(btn);
  }

  function removeFollowButton() {
    const existing = document.getElementById('followBtn');
    if (existing) existing.remove();
  }

  // Iniciar watchPosition y recalcular cuando te mueves lo suficiente
  function startFollowPosition(client, btnElement) {
    if (!navigator.geolocation) {
      alert('Geolocalización no disponible.');
      return;
    }
    btnElement.textContent = 'Detener seguimiento';

    followWatchId = navigator.geolocation.watchPosition(pos => {
      const cur = L.latLng(pos.coords.latitude, pos.coords.longitude);

      if (!lastFollowPos || cur.distanceTo(lastFollowPos) >= FOLLOW_MIN_MOVE_METERS) {
        lastFollowPos = cur;
        lastKnownPosition = [cur.lat, cur.lng];

        if (routingControl) {
          try {
            routingControl.setWaypoints([cur, L.latLng(client.lat, client.lon)]);
          } catch (err) {
            // recrear control si falla
            if (routingControl) { map.removeControl(routingControl); routingControl = null; }
            routingControl = L.Routing.control({
              waypoints: [cur, L.latLng(client.lat, client.lon)],
              router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
              showAlternatives: false,
              lineOptions: { styles: [{ color: '#2a9df4', opacity: 0.9, weight: 6 }] },
              createMarker: (i, wp) => L.marker(wp.latLng),
              routeWhileDragging: false,
              fitSelectedRoute: true,
              show: false
            }).addTo(map);
          }
        } else {
          routingControl = L.Routing.control({
            waypoints: [cur, L.latLng(client.lat, client.lon)],
            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
            showAlternatives: false,
            lineOptions: { styles: [{ color: '#2a9df4', opacity: 0.9, weight: 6 }] },
            createMarker: (i, wp) => L.marker(wp.latLng),
            routeWhileDragging: false,
            fitSelectedRoute: true,
            show: false
          }).addTo(map);
        }
      }
    }, err => {
      console.warn('watchPosition error:', err && err.message);
      alert('Error recibiendo posición en tiempo real: ' + (err && err.message));
      if (followWatchId != null) { navigator.geolocation.clearWatch(followWatchId); followWatchId = null; removeFollowButton(); }
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
  }

  // Botón para cancelar la ruta activa
  function addCancelRouteButton() {
    removeCancelRouteButton();
    removeFollowButton();
    const btn = document.createElement('button');
    btn.id = 'cancelRouteBtn';
    btn.textContent = 'Cancelar ruta';
    btn.addEventListener('click', () => {
      if (routingControl) { map.removeControl(routingControl); routingControl = null; }
      if (followWatchId != null) { navigator.geolocation.clearWatch(followWatchId); followWatchId = null; lastFollowPos = null; }
      removeCancelRouteButton();
      removeFollowButton();
    });
    document.getElementById('controls').appendChild(btn);
  }

  function removeCancelRouteButton() {
    const existing = document.getElementById('cancelRouteBtn');
    if (existing) existing.remove();
  }

  // Eliminar cliente por id
  function removeClient(id) {
    clients = clients.filter(c => c.id !== id);
    localStorage.setItem('clients', JSON.stringify(clients));
    const mk = markers.get(id);
    if (mk) {
      map.removeLayer(mk);
      markers.delete(id);
    }
    updateListUI();
  }

  // Exportar JSON y CSV
  exportBtn.addEventListener('click', () => {
    const choice = confirm('Aceptar = descargar JSON. Cancelar = descargar CSV.');
    if (choice) exportJSON();
    else exportCSV();
  });

  function exportJSON() {
    const blob = new Blob([JSON.stringify(clients, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'clientes.json');
  }

  function exportCSV() {
    const rows = [['Nombre', 'Dirección', 'Latitud', 'Longitud']];
    clients.forEach(c => rows.push([escapeCsv(c.name), escapeCsv(c.address), c.lat, c.lon]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, 'clientes.csv');
  }

  // Eliminar todo
  clearAllBtn && clearAllBtn.addEventListener('click', () => {
    if (!confirm('Eliminar todos los clientes guardados?')) return;
    clients = [];
    localStorage.removeItem('clients');
    markers.forEach(mk => map.removeLayer(mk));
    markers.clear();
    updateListUI();
    if (routingControl) { map.removeControl(routingControl); routingControl = null; removeCancelRouteButton(); }
    if (followWatchId != null) { navigator.geolocation.clearWatch(followWatchId); followWatchId = null; removeFollowButton(); }
  });

  // Soporte para cargar la posición a través de parámetros en la URL (enlace compartido)
  const params = new URLSearchParams(location.search);
  const qLat = parseFloat(params.get('lat'));
  const qLon = parseFloat(params.get('lon'));
  const qName = params.get('name');
  if (!isNaN(qLat) && !isNaN(qLon)) {
    map.setView([qLat, qLon], 16);
    L.marker([qLat, qLon]).addTo(map).bindPopup(qName ? decodeURIComponent(qName) : 'Ubicación compartida').openPopup();
  }

  // Utilidades
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"'`=\/]/g, function (c) {
      return {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
        "'": '&#39;', '/': '&#x2F;', '=': '&#x3D;', '`': '&#x60;'
      }[c];
    });
  }

  function escapeCsv(s) {
    if (s == null) return '';
    const str = String(s);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  // Mensaje temporal en pantalla simple (pequeño toast)
  function showTemporaryMessage(text, timeoutMs) {
    removeTemporaryMessage();
    const d = document.createElement('div');
    d.id = 'tmpMsg';
    d.textContent = text;
    document.body.appendChild(d);
    if (timeoutMs) setTimeout(() => d.remove(), timeoutMs);
    return d;
  }

  function hideTemporaryMessage(el) {
    if (el && el.remove) el.remove();
    removeTemporaryMessage();
  }

  function removeTemporaryMessage() {
    const prev = document.getElementById('tmpMsg');
    if (prev) prev.remove();
  }
});
