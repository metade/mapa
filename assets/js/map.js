// Map initialization and configuration
class MapManager {
  constructor() {
    this.map = null;
    this.featuresData = null;
    this.selectedFeatureId = null;
    this.init();
  }

  async init() {
    try {
      // Show loading state
      this.showLoading();

      // Load GeoJSON data
      await this.loadFeaturesData();

      // Initialize map
      this.initializeMap();
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
            <div class="map-loading">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">A carregar...</span>
                </div>
                <p class="mt-2 mb-0">A carregar dados do mapa...</p>
            </div>
        `;
    loadingDiv.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.9);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
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
            <div class="map-error">
                <h5>⚠️ Erro</h5>
                <p class="mb-0">${message}</p>
            </div>
        `;
  }

  async loadFeaturesData() {
    try {
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
    } catch (error) {
      console.error("Error loading GeoJSON data:", error);
      throw error;
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

    // Add GeoJSON source
    this.map.addSource("features", {
      type: "geojson",
      data: this.featuresData,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });

    // Add cluster circles
    this.map.addLayer({
      id: "clusters",
      type: "circle",
      source: "features",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#51bbd6",
          10,
          "#f1f075",
          30,
          "#f28cb1",
        ],
        "circle-radius": ["step", ["get", "point_count"], 20, 10, 30, 30, 40],
      },
    });

    // Skip cluster count labels to avoid font issues
    // Clusters will still show different colors/sizes based on point count

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

    // Fit map to show all features
    this.fitMapToFeatures();
  }

  addEventListeners() {
    // Click on clusters to zoom in
    this.map.on("click", "clusters", (e) => {
      const features = this.map.queryRenderedFeatures(e.point, {
        layers: ["clusters"],
      });
      const clusterId = features[0].properties.cluster_id;
      this.map
        .getSource("features")
        .getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;

          this.map.easeTo({
            center: features[0].geometry.coordinates,
            zoom: zoom,
          });
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

  openImageModal(imageSrc) {
    // Create a simple modal for image viewing
    const modal = document.createElement("div");
    modal.className = "modal fade";
    modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Imagem</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body text-center">
                        <img src="${imageSrc}" class="img-fluid" alt="Imagem">
                    </div>
                </div>
            </div>
        `;

    document.body.appendChild(modal);
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();

    // Remove modal from DOM when hidden
    modal.addEventListener("hidden.bs.modal", () => {
      document.body.removeChild(modal);
    });
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
                            <img src="${img}" alt="Imagem" class="img-thumbnail" style="width: 100px; height: 80px; object-fit: cover; cursor: pointer;" onclick="mapManager.openImageModal('${img}')">
                        `,
                          )
                          .join("")}
                    </div>
                </div>
            `;
    }

    const stateClass = this.getStateBadgeClass(estado);

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
        `;
  }

  fitMapToFeatures() {
    if (!this.featuresData?.features?.length) return;

    const coordinates = this.featuresData.features.map(
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
  }
}

// Initialize map when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
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
