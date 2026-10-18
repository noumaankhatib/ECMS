-- Client feedback (land record suggestion): Land ID, Plot/Block Number, Plot
-- Area, Type of Land Use. "Land ID – This is a unique number so wont be
-- duplicated" — hard unique, same pattern as property.reference.
--
-- Also adds raw survey coordinates (Easting/Northing/Projection Type) per
-- the client's request to "at least save some coordinates in the system",
-- without doing any lat/lng conversion yet.

ALTER TABLE property
  ADD COLUMN land_id         VARCHAR(50),
  ADD COLUMN block_number    VARCHAR(50),
  ADD COLUMN plot_area       DECIMAL(12, 2),
  ADD COLUMN land_use_type   VARCHAR(30),
  ADD COLUMN easting         DECIMAL(12, 3),
  ADD COLUMN northing        DECIMAL(12, 3),
  ADD COLUMN projection_type VARCHAR(40);

CREATE UNIQUE INDEX uq_property_land_id_live
  ON property (ecms_normalize_identifier(land_id))
  WHERE land_id IS NOT NULL AND archived_at IS NULL;
