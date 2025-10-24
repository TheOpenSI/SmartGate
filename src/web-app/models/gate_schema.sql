-- Add a table for animals potentially detected by gate
CREATE TABLE IF NOT EXISTS detected_animals (
    animal_id SERIAL PRIMARY KEY,
    animal_type VARCHAR(255) NOT NULL,
    animal_name VARCHAR(255) NOT NULL,
    is_endangered BOOLEAN NOT NULL,
    is_threat BOOLEAN NOT NULL,
    time_stamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Creating some predictable data for alerts
CREATE TYPE alert_level_enum AS ENUM ('info', 'warning', 'critical');

-- Add table for alerts 
CREATE TABLE IF NOT EXISTS alerts (
    alert_no SERIAL PRIMARY KEY,
    alert_desc TEXT,
    alert_level alert_level_enum,
    date_and_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mock data for testing alerts
INSERT INTO alerts (alert_desc, alert_level)
VALUES
    ('Gate #1 Opened', 'info'),
    ('Gate #2 unable to close', 'critical'),
    ('talned has logged in', 'info'),
    ('Animal has been detected, gate closed', 'warning');

-- Creating some predictable data for gates
CREATE TYPE gate_status_enum AS ENUM ('Open', 'Closed');

-- List of tables want to show for stats
-- Table about gates
CREATE TABLE IF NOT EXISTS gates (
    gate_no INTEGER PRIMARY KEY,
    gate_status gate_status_enum, -- opened or closed
    gate_no_opens BIGINT DEFAULT 0,
    gate_no_closes BIGINT DEFAULT 0
);

-- Table for the histogram about the animals (Animals vs Count)
CREATE TABLE IF NOT EXISTS animal_name_vs_count (
    animal_name VARCHAR(255) PRIMARY KEY,
    animal_count BIGINT NOT NULL DEFAULT 0
);
-- Function that counts the animal_name inside detected_animals table
CREATE OR REPLACE FUNCTION upsert_animal_name_vs_count()
RETURNS void AS $$
BEGIN
    -- Loop through aggregated data and upsert
    INSERT INTO animal_name_vs_count (animal_name, animal_count)
    SELECT
        animal_name,
        COUNT(*) AS animal_count
    FROM detected_animals
    GROUP BY animal_name
    ON CONFLICT (animal_name)
    DO UPDATE SET animal_count = EXCLUDED.animal_count;
END;
$$ LANGUAGE plpgsql;
-- Trigger Function which will update the animal_name_vs_count when a new animal gets inserted into
-- detected_animals
CREATE OR REPLACE FUNCTION trigger_update_animal_count()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM upsert_animal_name_vs_count();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_animal_count_trigger
AFTER INSERT ON detected_animals
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_update_animal_count();
-- Table showing count of total animals detected, threats and endangered and both a threat and endangered
-- Make a table called var_stats table...
-- Make key value table called var_stats where it stores stats about total animals detected, total threats, total endangered, and total threats and endangered
    -- below that shows the percentage of animals who are a threat
    -- showing percentage of animals who are engedangered

CREATE TABLE IF NOT EXISTS var_stats (
    key VARCHAR(255) PRIMARY KEY,
    value BIGINT NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION refresh_var_stats()
RETURNS void AS $$
DECLARE
    total_count BIGINT;
    threat_count BIGINT;
    threat_count_percent NUMERIC;
    endangered_count BIGINT;
    endangered_count_percent NUMERIC;
    both_count BIGINT;
    both_count_percent NUMERIC;
BEGIN
    SELECT COUNT(*) INTO total_count from detected_animals;
    SELECT COUNT(*) INTO threat_count FROM detected_animals WHERE is_threat;
    SELECT COUNT(*) INTO endangered_count FROM detected_animals WHERE is_endangered;
    SELECT COUNT(*) INTO both_count FROM detected_animals WHERE is_threat AND is_endangered;

    IF total_count > 0 THEN
        threat_count_percent := (threat_count::NUMERIC / total_count) * 100;
        endangered_count_percent := (endangered_count::NUMERIC / total_count) * 100;
        both_count_percent := (both_count::NUMERIC / total_count) * 100;
    ELSE
        threat_count_percent := 0;
        endangered_count_percent := 0;
        both_count_percent := 0;
    END IF;

    -- Upsert values
    INSERT INTO var_stats (key, value) VALUES
        ('total_animals', total_count),
        ('total_threats', threat_count),
        ('total_endangered', endangered_count),
        ('total_threats_and_endangered', both_count),
        ('percent_threats', threat_count_percent::BIGINT),
        ('percent_endangered', endangered_count_percent::BIGINT),
        ('percent_both', both_count_percent::BIGINT)
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to refresh stats
CREATE OR REPLACE FUNCTION trigger_refresh_var_stats()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM refresh_var_stats();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on insert into detected_animals
CREATE TRIGGER refresh_var_stats_after_insert
AFTER INSERT ON detected_animals
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_refresh_var_stats();

-- Provide some mock data to show what animals are potentially detected
INSERT INTO detected_animals (animal_type, animal_name, is_endangered, is_threat)
VALUES
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Amur Leopard', TRUE, TRUE),
    ('Mammal', 'Black Rhino', TRUE, FALSE),
    ('Mammal', 'Black Rhino', TRUE, FALSE),
    ('Mammal', 'Black Rhino', TRUE, FALSE),
    ('Mammal', 'Black Rhino', TRUE, FALSE),
    ('Mammal', 'Black Rhino', TRUE, FALSE),
    ('Mammal', 'Orangutan', TRUE, FALSE),
    ('Mammal', 'Orangutan', TRUE, FALSE),
    ('Mammal', 'Orangutan', TRUE, FALSE),
    ('Mammal', 'Orangutan', TRUE, FALSE),
    ('Mammal', 'Orangutan', TRUE, FALSE),
    ('Mammal', 'Orangutan', TRUE, FALSE),
    ('Mammal', 'Orangutan', TRUE, FALSE),
    ('Mammal', 'Giant Panda', TRUE, FALSE),
    ('Mammal', 'Giant Panda', TRUE, FALSE),
    ('Mammal', 'Giant Panda', TRUE, FALSE),
    ('Mammal', 'Giant Panda', TRUE, FALSE),
    ('Mammal', 'Giant Panda', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Asian Elephant', TRUE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Dog', FALSE, FALSE),
    ('Mammal', 'Cat', FALSE, FALSE),
    ('Mammal', 'Cat', FALSE, FALSE),
    ('Mammal', 'Cat', FALSE, FALSE),
    ('Mammal', 'Cat', FALSE, FALSE),
    ('Mammal', 'Cat', FALSE, FALSE),
    ('Mammal', 'Cat', FALSE, FALSE),
    ('Mammal', 'Cat', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Fox', FALSE, FALSE),
    ('Mammal', 'Snow Leopard', TRUE, TRUE);
