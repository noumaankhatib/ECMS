-- Oman's wilayats, so the property form's list works from the first day instead
-- of starting empty. Spellings follow common usage (Seeb, Quriyat) and are only a
-- starting point: an administrator can rename or retire any of them under
-- Setup -> Wilayats. A name already on the list (for example one backfilled from
-- an existing property) is left exactly as it is.

INSERT INTO wilayat (name) VALUES
  -- Muscat
  ('Muscat'), ('Muttrah'), ('Bawshar'), ('Seeb'), ('Al Amerat'), ('Quriyat'),
  -- Dhofar
  ('Salalah'), ('Taqah'), ('Mirbat'), ('Sadah'), ('Rakhyut'), ('Dhalkut'),
  ('Muqshin'), ('Shalim and the Hallaniyat Islands'), ('Thumrait'),
  -- Musandam
  ('Khasab'), ('Bukha'), ('Dibba'), ('Madha'),
  -- Al Buraimi
  ('Al Buraimi'), ('Mahdah'), ('As Sunaynah'),
  -- Ad Dakhiliyah
  ('Nizwa'), ('Samail'), ('Bahla'), ('Adam'), ('Al Hamra'), ('Manah'), ('Izki'),
  ('Bidbid'), ('Jabal Akhdar'),
  -- Al Batinah North
  ('Sohar'), ('Shinas'), ('Liwa'), ('Saham'), ('Al Khaburah'), ('As Suwaiq'),
  -- Al Batinah South
  ('Rustaq'), ('Al Awabi'), ('Nakhal'), ('Wadi Al Maawil'), ('Barka'), ('Al Musannah'),
  -- Ash Sharqiyah South
  ('Sur'), ('Al Kamil and Al Wafi'), ('Jalan Bani Bu Hassan'), ('Jalan Bani Bu Ali'),
  ('Masirah'),
  -- Ash Sharqiyah North
  ('Ibra'), ('Al Mudhaibi'), ('Bidiyah'), ('Al Qabil'), ('Wadi Bani Khalid'),
  ('Dima Wa Al Taiyyin'), ('Sinaw'),
  -- Adh Dhahirah
  ('Ibri'), ('Yanqul'), ('Dhank'),
  -- Al Wusta
  ('Haima'), ('Mahut'), ('Duqm'), ('Al Jazer')
ON CONFLICT (name) DO NOTHING;
