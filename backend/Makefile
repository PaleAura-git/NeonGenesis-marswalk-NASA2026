# Marswalk data pipeline. Run from backend/ with the venv active (or set PY).
#   make download   fetch the raw NASA data (~3.3 GB, once, needs internet)
#   make all        rebuild everything from data/raw (works offline)
#   make serve      start the planner API on http://127.0.0.1:8000

PY       ?= venv/bin/python
BOX      ?= 9.0 10.8 4
DTM      ?= data/raw/hirise/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif
THEMIS   ?= data/raw/themis/themis_nightir_jezero.tif
ORTHO    ?= data/raw/hirise_ortho/demo_rows.bin
TRAVERSE ?= data/raw/m2020/M20_traverse.json
USGS     := https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE
export MPLBACKEND ?= Agg

GRID := data/processed/demo_grid.tif

.PHONY: all download grid ortho classify routes exports validate serve

all: exports validate

download:
	mkdir -p data/raw/hirise data/raw/hirise_ortho data/raw/m2020
	curl -C - -o $(DTM) $(USGS)/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif
	curl -r 3698952257-5068552256 -o $(ORTHO) $(USGS)/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif
	curl -o $(TRAVERSE) https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json
	$(PY) scripts/fetch_themis.py $(DTM) $(BOX) $(THEMIS)

grid: $(GRID)
$(GRID): $(DTM) $(THEMIS) sites.csv scripts/build_grid.py
	$(PY) scripts/build_grid.py $(DTM) $(THEMIS) sites.csv $(BOX)

ortho: data/processed/ortho_25cm.tif
data/processed/ortho_25cm.tif: $(ORTHO) $(GRID) scripts/make_ortho.py
	$(PY) scripts/make_ortho.py $(ORTHO) $(GRID)

classify: data/processed/terrain.tif
data/processed/terrain.tif: $(GRID) data/processed/ortho_25cm.tif labels/labels.csv scripts/train_classifier.py
	$(PY) scripts/train_classifier.py $(GRID) data/processed/ortho_25cm.tif labels/labels.csv labels/check_labels.csv
	$(PY) scripts/train_classifier.py $(GRID) data/processed/ortho_25cm.tif labels/labels.csv labels/check_labels_round2.csv | grep "Blind check"

routes: classify
	$(PY) scripts/plan_routes.py $(GRID) sites.csv

exports: routes
	$(PY) scripts/export_for_map.py $(GRID) sites.csv
	cp exports/optical.png exports/slope.png exports/terrain.png ../frontend/public/data/

validate: classify
	$(PY) scripts/validate_routes.py $(GRID) sites.csv $(TRAVERSE)

serve:
	$(PY) scripts/server.py $(GRID) sites.csv
