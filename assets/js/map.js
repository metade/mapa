// Map initialization and configuration
class MapManager {
  constructor() {
    this.map = null;
    this.featuresData = null;
    this.filteredData = null;
    this.selectedFeatureId = null;
    this.filters = {
      tema: "",
      pelouro: "",
      estado: "",
    };
    this.init();
  }

  // Helper function to generate URLs with Jekyll base URL
  // This handles deployment to subdirectories (e.g., GitHub Pages)
  // Examples:
  //   Local dev (baseUrl: null): "/pontos/abc/" → "/pontos/abc/"
  //   GitHub Pages (baseUrl: "/mapa"): "/pontos/abc/" → "/mapa/pontos/abc/"
  getUrl(path) {
    const baseUrl = window.pageData?.baseUrl || "";

    // If no baseUrl or path doesn't start with /, return as-is
    if (!baseUrl || !path.startsWith("/")) {
      return path;
    }

    return baseUrl + path;
  }

  async init() {
    try {
      // Show loading state
      this.showLoading();

      // Load GeoJSON data
      await this.loadFeaturesData();

      // Initialize map
      this.initializeMap();

      // Initialize filters
      this.initializeFilters();
    } catch (error) {
      console.error("Error initializing map:", error);
      this.showError(`Erro ao carregar o mapa: ${error.message}`);
    }
  }

  showLoading() {
    const mapContainer = document.getElementById("map");
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "map-loading-overlay";
    loadingDiv.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">A carregar...</span>
                </div>
                <p class="mt-2 mb-0">A carregar dados do mapa...</p>
            </div>
        `;
    loadingDiv.className =
      "position-absolute top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center bg-white bg-opacity-75";
    loadingDiv.style.zIndex = "9999";
    mapContainer.appendChild(loadingDiv);
  }

  hideLoading() {
    const loadingOverlay = document.getElementById("map-loading-overlay");
    if (loadingOverlay) {
      loadingOverlay.remove();
    }
  }

  showError(message) {
    const mapContainer = document.getElementById("map");
    mapContainer.innerHTML = `
            <div class="position-absolute top-50 start-50 translate-middle text-center bg-danger bg-opacity-90 text-white p-4 rounded" style="max-width: 300px; z-index: 999;">
                <h5 class="mb-2">⚠️ Erro</h5>
                <p class="mb-0">${message}</p>
            </div>
        `;
  }

  async loadFeaturesData() {
    try {
      // Load features GeoJSON
      const response = await fetch(window.pageData.featuresGeoJsonUrl);

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`,
        );
      }

      this.featuresData = await response.json();
      console.log(
        "GeoJSON data loaded:",
        this.featuresData?.features?.length,
        "features",
      );

      // Load boundary GeoJSON
      await this.loadBoundaryData();
    } catch (error) {
      console.error("Error loading GeoJSON data:", error);
      throw error;
    }
  }

  async loadBoundaryData() {
    try {
      const boundaryUrl =
        window.pageData?.boundaryGeoJsonUrl ||
        this.getUrl("/assets/boundary.geojson");
      const response = await fetch(boundaryUrl);

      if (!response.ok) {
        console.warn("Boundary data not available:", response.status);
        return;
      }

      this.boundaryData = await response.json();
      console.log("Boundary data loaded");
    } catch (error) {
      console.warn("Error loading boundary data:", error);
      // Don't throw - boundary is optional
    }
  }

  initializeMap() {
    // Get map center from page data or use default
    let mapCenter = [-9.13628, 38.72614]; // Default coordinates

    // Parse map center from page data
    if (window.pageData?.mapCenter) {
      const centerData = window.pageData.mapCenter;
      if (Array.isArray(centerData) && centerData.length === 2) {
        mapCenter = centerData;
      } else if (typeof centerData === "string") {
        try {
          const parsed = JSON.parse(centerData);
          if (Array.isArray(parsed) && parsed.length === 2) {
            mapCenter = parsed;
          }
        } catch (e) {
          console.warn("Failed to parse map center from string:", centerData);
        }
      }
    }

    // Initialize MapLibre map (loading will be cleared after map loads)
    const MAPTILER_KEY = "yALgp8vIEc84mrgiYZb0";

    this.map = new maplibregl.Map({
      container: "map",
      style: `https://api.maptiler.com/maps/positron/style.json?key=${MAPTILER_KEY}`,
      center: mapCenter,
      zoom: 14,
    });

    // Wait for map to load, then add features
    this.map.on("load", () => {
      this.hideLoading();
      this.addFeaturesToMap();
    });

    this.map.on("error", (e) => {
      console.error("MapLibre error:", e);
      this.hideLoading();
      this.showError("Erro ao inicializar o mapa.");
    });

    // Add navigation controls
    this.map.addControl(new maplibregl.NavigationControl(), "top-right");

    // Add geolocate control
    this.map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      "top-right",
    );
  }

  addFeaturesToMap() {
    if (!this.featuresData || !this.featuresData.features) {
      console.warn("No features data available");
      return;
    }

    // Add boundary layer first (if available)
    this.addBoundaryToMap();

    // Add GeoJSON source with clustering
    // Clustering groups nearby points into circles with count labels
    // - Clusters appear when zoomed out and points are close together
    // - Click clusters to zoom in and separate the points
    // - Individual points appear when zoomed in enough
    const dataToShow = this.filteredData || this.featuresData;
    this.map.addSource("features", {
      type: "geojson",
      data: dataToShow,
      cluster: true,
      clusterMaxZoom: 14, // Stop clustering at zoom 14
      clusterRadius: 50, // Group points within 50px radius
    });

    // Add cluster circles with improved styling
    this.map.addLayer({
      id: "clusters",
      type: "circle",
      source: "features",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#0d6efd", // Bootstrap primary blue for small clusters
          5,
          "#198754", // Bootstrap success green for medium clusters
          15,
          "#fd7e14", // Bootstrap warning orange for large clusters
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          20, // Small clusters: 20px
          5,
          25, // Medium clusters: 25px
          15,
          30, // Large clusters: 30px
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.8,
      },
    });

    // Add cluster count labels with error handling
    try {
      this.map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "features",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular", "Arial Unicode MS Regular"],
          "text-size": 14,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1,
          "text-halo-blur": 1,
        },
      });
    } catch (error) {
      console.warn("Could not add cluster count labels:", error);
      // Continue without text labels - clusters will still work with color/size
    }

    // Add individual point markers
    this.map.addLayer({
      id: "unclustered-point",
      type: "circle",
      source: "features",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "slug"], ["literal", this.selectedFeatureId || ""]],
          "#28a745", // Green for selected
          "#0d6efd", // Blue for normal
        ],
        "circle-radius": [
          "case",
          ["==", ["get", "slug"], ["literal", this.selectedFeatureId || ""]],
          12, // Larger for selected
          8, // Normal size
        ],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "slug"], ["literal", this.selectedFeatureId || ""]],
          3, // Thicker stroke for selected
          2, // Normal stroke
        ],
        "circle-stroke-color": "#ffffff",
      },
    });

    // Add click handlers
    this.addEventListeners();

    // Fit map to show all features, or boundary if no features
    this.fitMapToFeatures() || this.fitMapToBoundary();
  }

  addEventListeners() {
    // Click on clusters to zoom in (immediate single click)
    this.map.on("click", "clusters", (e) => {
      // Immediate response to prevent any delay
      const features = this.map.queryRenderedFeatures(e.point, {
        layers: ["clusters"],
      });

      if (!features.length) return;

      const clusterId = features[0].properties.cluster_id;
      const pointCount = features[0].properties.point_count;

      console.log(`Cluster clicked with ${pointCount} points, zooming in...`);

      // Use simplified zoom approach first (more reliable)
      const currentZoom = this.map.getZoom();
      console.log(`Current zoom level: ${currentZoom.toFixed(1)}`);
      console.log(`Cluster coordinates:`, features[0].geometry.coordinates);

      // Simple approach: zoom in by 2-3 levels depending on current zoom
      let targetZoom;
      if (currentZoom < 10) {
        targetZoom = currentZoom + 3;
      } else if (currentZoom < 14) {
        targetZoom = currentZoom + 2;
      } else {
        targetZoom = Math.min(currentZoom + 1.5, 16);
      }

      console.log(`Zooming from ${currentZoom.toFixed(1)} to ${targetZoom}`);

      this.map.easeTo({
        center: features[0].geometry.coordinates,
        zoom: targetZoom,
        duration: 600,
        essential: true,
      });

      // Add callback to confirm zoom completion
      this.map.once("moveend", () => {
        console.log(
          `Zoom animation completed. Final zoom: ${this.map.getZoom().toFixed(1)}`,
        );
      });
    });

    // Click on individual points to show sidebar
    this.map.on("click", "unclustered-point", (e) => {
      const slug = e.features[0].properties.slug;
      if (slug) {
        this.selectFeature(slug);
      } else {
        // Fallback if no slug - use first available identifier
        const props = e.features[0].properties;
        const fallbackFeature = this.featuresData?.features?.find(
          (f) => f.properties.nome === props.nome,
        );
        if (fallbackFeature) {
          this.selectFeature(fallbackFeature.properties.slug);
        }
      }
    });

    // Change cursor on hover
    this.map.on("mouseenter", "clusters", () => {
      this.map.getCanvas().style.cursor = "pointer";
    });

    this.map.on("mouseleave", "clusters", () => {
      this.map.getCanvas().style.cursor = "";
    });

    this.map.on("mouseenter", "unclustered-point", () => {
      this.map.getCanvas().style.cursor = "pointer";
    });

    this.map.on("mouseleave", "unclustered-point", () => {
      this.map.getCanvas().style.cursor = "";
    });
  }

  getStateBadgeClass(estado) {
    switch (estado?.toLowerCase()) {
      case "resolvido":
        return "bg-success";
      case "em progresso":
        return "bg-warning";
      case "por resolver":
      default:
        return "bg-danger";
    }
  }

  selectFeature(slug) {
    // Update selected feature
    this.selectedFeatureId = slug;

    // Update marker styling
    this.updateMarkerStyling();

    // Open details panel
    this.openDetailsPanel(slug);
  }

  updateMarkerStyling() {
    // Update the paint properties to reflect the new selection
    this.map.setPaintProperty("unclustered-point", "circle-color", [
      "case",
      ["==", ["get", "slug"], ["literal", this.selectedFeatureId || ""]],
      "#28a745", // Green for selected
      "#0d6efd", // Blue for normal
    ]);

    this.map.setPaintProperty("unclustered-point", "circle-radius", [
      "case",
      ["==", ["get", "slug"], ["literal", this.selectedFeatureId || ""]],
      12, // Larger for selected
      8, // Normal size
    ]);

    this.map.setPaintProperty("unclustered-point", "circle-stroke-width", [
      "case",
      ["==", ["get", "slug"], ["literal", this.selectedFeatureId || ""]],
      3, // Thicker stroke for selected
      2, // Normal stroke
    ]);
  }

  openDetailsPanel(slug) {
    // Find feature by slug
    const feature = this.featuresData?.features?.find(
      (f) => f.properties.slug === slug,
    );
    if (!feature) {
      console.warn("Feature not found:", slug);
      return;
    }

    // Center map on the selected feature
    const coordinates = feature.geometry.coordinates;
    this.map.flyTo({
      center: coordinates,
      zoom: Math.max(this.map.getZoom(), 16),
      duration: 1000,
    });

    // Update panel content
    this.updateDetailsPanel(feature.properties);

    // Show the offcanvas panel
    const panel = document.getElementById("detailsPanel");
    const offcanvas = new bootstrap.Offcanvas(panel);
    offcanvas.show();
  }

  updateDetailsPanel(props) {
    const {
      nome = "Sem nome",
      descricao = "Sem descrição",
      pelouro = "N/A",
      tema = "N/A",
      estado = "N/A",
      imagens,
      slug,
    } = props;

    let imagesHtml = "";
    let imageArray = [];

    // Handle various data types for images
    try {
      if (imagens) {
        if (Array.isArray(imagens)) {
          imageArray = imagens.filter((img) => img && typeof img === "string");
        } else if (typeof imagens === "string") {
          // Single image as string
          imageArray = [imagens];
        } else if (typeof imagens === "object") {
          // Try to extract array from object or convert to array
          imageArray = Object.values(imagens).filter(
            (img) => img && typeof img === "string",
          );
        }
      }
    } catch (error) {
      console.error("Error processing images:", error);
      imageArray = [];
    }

    if (imageArray.length > 0) {
      imagesHtml = `
                <div class="mb-3">
                    <h6>Imagens</h6>
                    <div class="d-flex flex-wrap gap-2">
                        ${imageArray
                          .map(
                            (img) => `
                            <img src="${this.getUrl(img)}" alt="Imagem" class="img-thumbnail rounded">
                        `,
                          )
                          .join("")}
                    </div>
                </div>
            `;
    }

    const stateClass = this.getStateBadgeClass(estado);

    // Build navigation link if slug exists
    const navigationHtml = slug
      ? `
        <div class="mb-3">
            <a href="${this.getUrl(`/pontos/${slug}/`)}" class="btn btn-primary btn-lg w-100 d-flex align-items-center justify-content-center gap-2 fw-medium py-3">
                <i class="bi bi-arrow-right-circle fs-5"></i>
                Ver Página Completa
            </a>
        </div>
    `
      : "";

    const panelBody = document.getElementById("panelBody");
    panelBody.innerHTML = `
            <h5 class="mb-3">${nome}</h5>

            <div class="mb-3">
                <h6>Descrição</h6>
                <p>${descricao}</p>
            </div>

            <div class="mb-3">
                <h6>Detalhes</h6>
                <p><strong>Pelouro:</strong> <span class="badge bg-secondary">${pelouro}</span></p>
                <p><strong>Tema:</strong> <span class="badge bg-info">${tema}</span></p>
                <p><strong>Estado:</strong> <span class="badge ${stateClass}">${estado}</span></p>
            </div>

            ${imagesHtml}

            ${navigationHtml}
        `;
  }

  fitMapToFeatures() {
    const dataToUse = this.filteredData || this.featuresData;
    if (!dataToUse?.features?.length) return false;

    const coordinates = dataToUse.features.map(
      (feature) => feature.geometry.coordinates,
    );

    if (coordinates.length === 1) {
      // Single point - center on it
      this.map.flyTo({
        center: coordinates[0],
        zoom: 15,
      });
    } else {
      // Multiple points - fit bounds
      const bounds = coordinates.reduce(
        (bounds, coord) => {
          return bounds.extend(coord);
        },
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
      );

      this.map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 16,
      });
    }
    return true;
  }

  addBoundaryToMap() {
    if (!this.boundaryData) return;

    // Add boundary source
    this.map.addSource("boundary", {
      type: "geojson",
      data: this.boundaryData,
    });

    // Add boundary outline (continuous line, no fill)
    this.map.addLayer({
      id: "boundary-outline",
      type: "line",
      source: "boundary",
      paint: {
        "line-color": "#0d6efd",
        "line-width": 3,
        "line-opacity": 0.8,
      },
    });

    console.log("Boundary layer added to map");
  }

  fitMapToBoundary() {
    if (!this.boundaryData || !this.boundaryData.features?.length) return;

    try {
      // Get boundary feature coordinates
      const feature = this.boundaryData.features[0];
      if (feature.geometry.type === "Polygon") {
        const coordinates = feature.geometry.coordinates[0];

        // Create bounds from boundary coordinates
        const bounds = coordinates.reduce(
          (bounds, coord) => {
            return bounds.extend(coord);
          },
          new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
        );

        // Fit map to boundary with padding
        this.map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
        });

        console.log("Map fitted to boundary area");
      }
    } catch (error) {
      console.warn("Error fitting map to boundary:", error);
    }
  }

  // Initialize filter dropdowns and event listeners
  initializeFilters() {
    this.populateFilterDropdowns();
    this.addFilterEventListeners();
  }

  // Populate filter dropdowns with unique values from data
  populateFilterDropdowns() {
    if (!this.featuresData || !this.featuresData.features) {
      return;
    }

    const temas = new Set();
    const pelouros = new Set();
    const estados = new Set();

    // Extract unique values
    this.featuresData.features.forEach((feature) => {
      if (feature.properties.tema) temas.add(feature.properties.tema);
      if (feature.properties.pelouro) pelouros.add(feature.properties.pelouro);
      if (feature.properties.estado) estados.add(feature.properties.estado);
    });

    // Populate dropdowns
    this.populateDropdown("temaFilter", Array.from(temas).sort());
    this.populateDropdown("pelouroFilter", Array.from(pelouros).sort());
    this.populateDropdown("estadoFilter", Array.from(estados).sort());
  }

  // Helper method to populate a dropdown
  populateDropdown(elementId, values) {
    const select = document.getElementById(elementId);
    if (!select) return;

    // Clear existing options except the first "all" option
    while (select.children.length > 1) {
      select.removeChild(select.lastChild);
    }

    // Add new options
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  // Add event listeners for filter controls
  addFilterEventListeners() {
    const temaFilter = document.getElementById("temaFilter");
    const pelouroFilter = document.getElementById("pelouroFilter");
    const estadoFilter = document.getElementById("estadoFilter");
    const clearFiltersBtn = document.getElementById("clearFilters");

    if (temaFilter) {
      temaFilter.addEventListener("change", () => {
        this.filters.tema = temaFilter.value;
        this.applyFilters();
      });
    }

    if (pelouroFilter) {
      pelouroFilter.addEventListener("change", () => {
        this.filters.pelouro = pelouroFilter.value;
        this.applyFilters();
      });
    }

    if (estadoFilter) {
      estadoFilter.addEventListener("change", () => {
        this.filters.estado = estadoFilter.value;
        this.applyFilters();
      });
    }

    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener("click", () => {
        this.clearFilters();
      });
    }
  }

  // Apply current filters to the data
  applyFilters() {
    if (!this.featuresData) return;

    let filteredFeatures = this.featuresData.features;

    // Apply tema filter
    if (this.filters.tema) {
      filteredFeatures = filteredFeatures.filter(
        (feature) => feature.properties.tema === this.filters.tema,
      );
    }

    // Apply pelouro filter
    if (this.filters.pelouro) {
      filteredFeatures = filteredFeatures.filter(
        (feature) => feature.properties.pelouro === this.filters.pelouro,
      );
    }

    // Apply estado filter
    if (this.filters.estado) {
      filteredFeatures = filteredFeatures.filter(
        (feature) => feature.properties.estado === this.filters.estado,
      );
    }

    // Create filtered GeoJSON
    this.filteredData = {
      ...this.featuresData,
      features: filteredFeatures,
    };

    // Update map display
    this.updateMapWithFilteredData();
    this.updateActiveFiltersCount();
  }

  // Update map with filtered data
  updateMapWithFilteredData() {
    if (!this.map || !this.map.getSource("features")) return;

    // Update the source data
    this.map
      .getSource("features")
      .setData(this.filteredData || this.featuresData);

    // Fit map to filtered features if any exist
    if (this.filteredData && this.filteredData.features.length > 0) {
      this.fitMapToFeatures();
    }
  }

  // Clear all filters
  clearFilters() {
    this.filters = {
      tema: "",
      pelouro: "",
      estado: "",
    };

    // Reset dropdown selections
    const temaFilter = document.getElementById("temaFilter");
    const pelouroFilter = document.getElementById("pelouroFilter");
    const estadoFilter = document.getElementById("estadoFilter");

    if (temaFilter) temaFilter.value = "";
    if (pelouroFilter) pelouroFilter.value = "";
    if (estadoFilter) estadoFilter.value = "";

    // Clear filtered data
    this.filteredData = null;

    // Update map
    this.updateMapWithFilteredData();
    this.updateActiveFiltersCount();
  }

  // Update the active filters count badge
  updateActiveFiltersCount() {
    const badge = document.getElementById("activeFiltersCount");
    if (!badge) return;

    const activeCount = Object.values(this.filters).filter(
      (filter) => filter !== "",
    ).length;

    if (activeCount > 0) {
      badge.textContent = `${activeCount} filtro${activeCount > 1 ? "s" : ""} ativo${activeCount > 1 ? "s" : ""}`;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }
}

// Initialize map when page loads
document.addEventListener("DOMContentLoaded", function () {
  // Check if required libraries are loaded
  if (typeof maplibregl === "undefined") {
    console.error("MapLibre GL JS not loaded!");
    return;
  }

  if (typeof bootstrap === "undefined") {
    console.warn("Bootstrap JS not loaded - some features may not work");
  }

  window.mapManager = new MapManager();
});
