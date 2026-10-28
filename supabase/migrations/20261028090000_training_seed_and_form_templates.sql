-- DB-20 (D4, D13, D31, D32): Training and the form templates, in the current form format.
--
-- Why a forward migration and not an edit of the baseline. 20261024090000_form_schema2.sql embeds the
-- SHA-256 of the two baseline form rows and refuses any other populated table, and its version is already
-- in the hosted history. Editing those rows would stop a fresh build at that migration, and repairing that
-- means editing a migration that has been applied. New canonical rows have to be created after schema 2
-- in any case, so everything lands here: the baseline and schema 2 stay as hosted already ran them, and
-- local, CI, the disposable rehearsals and the OPS-19 rebuild all run one chain.
--
-- What it does:
--   1. Removes the baseline's two seed form versions: `shell-v1`, a practice form in the legacy practice
--      project, and `training-v1`, whose definition names itself `janet-test-v1` and `draft` while the row
--      is published. Published versions are immutable; like schema 2, this seed correction is a sanctioned
--      exception and lifts the trigger only inside this transaction. The practice organization, project and
--      site stay (D13); GIS-03 retires them with the sample view. Local tests keep a practice form through
--      supabase/seed.sql, which no hosted target ever runs.
--   2. Seeds Training: the Practice garden site, two published forms (Janet's play form and inventory
--      form, named as the API names a version: version = code, status = state) and a ready package v1 that
--      names both, with its two zones, its checks and its publication record, exactly the rows the zone
--      publication function writes.
--   3. Adds fieldmaps.form_templates, seeded from contracts/forms, which BE-25 serves to managers.
--
-- The Practice garden's geometry is contracts/fixtures/sites/practice-garden.json; the form definitions
-- are contracts/forms/janet-test-v1.json and janet-inventory-v1.json. database/tests/seed-forms.sql keeps
-- the three equal. Fixed ids (the 0101-0103 family is Training's): 0104 play form version, 0105 inventory
-- form version, 0106 package, 0107 and 0108 zones A and B, 0109 inventory form, 01ff the author of the
-- seed (a marker, not an account).

CREATE TABLE fieldmaps.form_templates (
    code text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    definition jsonb NOT NULL,
    schema_version integer NOT NULL,
    CONSTRAINT form_templates_pkey PRIMARY KEY (code),
    CONSTRAINT form_templates_code_check CHECK (code ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
    CONSTRAINT form_templates_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    CONSTRAINT form_templates_summary_check CHECK (length(btrim(summary)) BETWEEN 1 AND 1000),
    CONSTRAINT form_templates_definition_check CHECK (jsonb_typeof(definition) = 'object'),
    CONSTRAINT form_templates_schema_version_check CHECK (schema_version > 0)
);

ALTER TABLE fieldmaps.form_templates ENABLE ROW LEVEL SECURITY;

-- Templates are product content, not tenant data: any signed-in API caller reads them (the API limits
-- them to managers) and only a migration changes them.
CREATE POLICY signed_in_reads_templates ON fieldmaps.form_templates FOR SELECT TO fieldmaps_api
    USING (fieldmaps.request_user_id() IS NOT NULL);

GRANT SELECT ON TABLE fieldmaps.form_templates TO fieldmaps_api;

-- A stored zip (no compression): enough for every reader, and it needs no library in the database.
CREATE FUNCTION pg_temp.seed_le(p_value bigint, p_bytes integer) RETURNS bytea LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE result bytea := decode(repeat('00', p_bytes), 'hex');
BEGIN
  FOR i IN 0..p_bytes - 1 LOOP
    result := set_byte(result, i, ((p_value >> (8 * i)) & 255)::integer);
  END LOOP;
  RETURN result;
END;
$$;

CREATE FUNCTION pg_temp.seed_crc32(p_data bytea) RETURNS bigint LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE codes bigint[] := '{}'; c bigint; crc bigint := 4294967295;
BEGIN
  FOR n IN 0..255 LOOP
    c := n;
    FOR k IN 1..8 LOOP
      c := CASE WHEN c & 1 = 1 THEN 3988292384 # (c >> 1) ELSE c >> 1 END;
    END LOOP;
    codes := array_append(codes, c);
  END LOOP;
  FOR i IN 0..length(p_data) - 1 LOOP
    crc := codes[((crc # get_byte(p_data, i)) & 255)::integer + 1] # (crc >> 8);
  END LOOP;
  RETURN crc # 4294967295;
END;
$$;

CREATE FUNCTION pg_temp.seed_zip(p_names text[], p_contents bytea[]) RETURNS bytea LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE body bytea := ''; directory bytea := ''; name bytea; crc bigint; size bigint;
BEGIN
  FOR i IN 1..cardinality(p_names) LOOP
    name := convert_to(p_names[i], 'UTF8');
    crc := pg_temp.seed_crc32(p_contents[i]);
    size := length(p_contents[i]);
    -- Fixed timestamp 1980-01-01 00:00:00 and mode 0644, as the API's own archives use.
    directory := directory || decode('504b0102', 'hex') || pg_temp.seed_le(788, 2) || pg_temp.seed_le(20, 2)
      || pg_temp.seed_le(0, 2) || pg_temp.seed_le(0, 2) || pg_temp.seed_le(0, 2) || pg_temp.seed_le(33, 2)
      || pg_temp.seed_le(crc, 4) || pg_temp.seed_le(size, 4) || pg_temp.seed_le(size, 4)
      || pg_temp.seed_le(length(name), 2) || pg_temp.seed_le(0, 2) || pg_temp.seed_le(0, 2)
      || pg_temp.seed_le(0, 2) || pg_temp.seed_le(0, 2) || pg_temp.seed_le(27525120, 4)
      || pg_temp.seed_le(length(body), 4) || name;
    body := body || decode('504b0304', 'hex') || pg_temp.seed_le(20, 2) || pg_temp.seed_le(0, 2)
      || pg_temp.seed_le(0, 2) || pg_temp.seed_le(0, 2) || pg_temp.seed_le(33, 2)
      || pg_temp.seed_le(crc, 4) || pg_temp.seed_le(size, 4) || pg_temp.seed_le(size, 4)
      || pg_temp.seed_le(length(name), 2) || pg_temp.seed_le(0, 2) || name || p_contents[i];
  END LOOP;
  RETURN body || directory || decode('504b0506', 'hex') || pg_temp.seed_le(0, 2) || pg_temp.seed_le(0, 2)
    || pg_temp.seed_le(cardinality(p_names), 2) || pg_temp.seed_le(cardinality(p_names), 2)
    || pg_temp.seed_le(length(directory), 4) || pg_temp.seed_le(length(body), 4) || pg_temp.seed_le(0, 2);
END;
$$;

DO $seed$
DECLARE
  org constant uuid := '10000000-0000-4000-8000-000000000101';
  project constant uuid := '10000000-0000-4000-8000-000000000102';
  site constant uuid := '10000000-0000-4000-8000-000000000103';
  play constant uuid := '10000000-0000-4000-8000-000000000104';
  inventory constant uuid := '10000000-0000-4000-8000-000000000105';
  package constant uuid := '10000000-0000-4000-8000-000000000106';
  inventory_form constant uuid := '10000000-0000-4000-8000-000000000109';
  play_form constant uuid := '45c54dbd-24a3-4c54-875a-0c5bf7b6673f';
  author constant uuid := '10000000-0000-4000-8000-0000000001ff';
  old_shell constant uuid := '10000000-0000-4000-8000-000000000004';
  old_shell_form constant uuid := '77f41d15-b653-465a-abb9-39f19f606851';
  schema_number constant integer := 2;
  behaviour_mapping constant jsonb := $json${
  "version": "janet-test-v1",
  "title": "Janet test subset",
  "summary": "Twelve questions across five acts, drawn from the confirmed candidate subset.",
  "source": "Variables to use for App testing.xlsx, Sheet1 — see docs/Janet-Test-Form-Scope.md",
  "status": "draft",
  "inclusion": "Excludes all 16 hidden workbook rows (Sheet1 rows 33–40 and 180–187), as the user confirmed for the first test form. Option codes are provisional implementation identifiers and are not workbook values.",
  "knownExportCollisions": [],
  "protocolNotes": [
    {
      "id": "presenting-gender",
      "title": "Presenting gender has no export column",
      "detail": "Test E51 and Library E75 are both blank. The field is held out of this version until a column name is agreed rather than shipped under an invented one.",
      "source": "Sheet1 E51 · Library E75"
    },
    {
      "id": "manufactured-loose-parts",
      "title": "Manufactured loose parts collide with natural loose parts",
      "detail": "Test E168 and E169 both read Nat_LP_Intn_Binary, so the two answers would land in one column. The loose-parts group waits for a distinct export name.",
      "source": "Sheet1 E168 · E169"
    },
    {
      "id": "natural-materials-list",
      "title": "The natural materials list has not been provided",
      "detail": "Test G171 says the list is to be provided. The checklist is held out rather than shipped with the instruction's own examples standing in as if they were the instrument.",
      "source": "Sheet1 G171"
    },
    {
      "id": "play-type-2-required",
      "title": "Whether a second play type is required is undecided",
      "detail": "The scope document leaves this open, so the second slot is optional here and never blocks a save.",
      "source": "Sheet1 B83:G100"
    },
    {
      "id": "play-subtype-two-slot",
      "title": "The two-slot subtype interpretation is unconfirmed",
      "detail": "The test sheet supplies one subtype set. Slot two keeps its own independent answer, but has no export column until the full library's interpretation is confirmed.",
      "source": "Sheet1 B101:G133"
    },
    {
      "id": "wildlife-columns",
      "title": "The wildlife branch has no supplied export columns or type list",
      "detail": "Rows B188:H197 name the fields but not their analysis columns, and the interaction type list is not in the sheet. Answers are stored by question identifier only.",
      "source": "Sheet1 B188:H197"
    },
    {
      "id": "wildlife-other-reveal",
      "title": "The wildlife follow-ups use the broad reveal rule",
      "detail": "All three follow-ups appear on Yes, as the current rule reads. Confirm whether the Other description should appear only when the interaction type is Other.",
      "source": "Sheet1 H188"
    },
    {
      "id": "carry-forward",
      "title": "Which answers carry across observations is undecided",
      "detail": "This version carries observer initials, zone and round into the next observation and clears every event answer. Round climate and zone inventory are not collected yet.",
      "source": "Sheet1 G171, G173, G175, G177, G179"
    }
  ],
  "questions": [
    {
      "id": "age_range",
      "code": "Age1",
      "exportColumn": "Child_AgeRange",
      "act": "Child",
      "label": "How old is the target child?",
      "hint": "Closest of the six supplied ranges. Observers are not expected to ask.",
      "kind": "one",
      "options": [
        {
          "code": "age_0_2",
          "label": "0–2 yrs"
        },
        {
          "code": "age_3_5",
          "label": "3–5 yrs"
        },
        {
          "code": "age_6_8",
          "label": "6–8 yrs"
        },
        {
          "code": "age_9_12",
          "label": "9–12 yrs"
        },
        {
          "code": "age_13_16",
          "label": "13–16 yrs"
        },
        {
          "code": "age_17_plus",
          "label": "17+"
        }
      ],
      "columns": 3,
      "required": true,
      "source": "Sheet1 B44:G49"
    },
    {
      "id": "play_type_1",
      "code": "PlayType1",
      "exportColumn": "Play_Type_1",
      "act": "Play",
      "label": "Primary play type",
      "kind": "one",
      "options": [
        {
          "code": "physical",
          "label": "Physical"
        },
        {
          "code": "exploratory",
          "label": "Exploratory"
        },
        {
          "code": "imaginative",
          "label": "Imaginative"
        },
        {
          "code": "play_with_rules",
          "label": "Play with Rules"
        },
        {
          "code": "bio",
          "label": "Bio"
        },
        {
          "code": "expressive",
          "label": "Expressive"
        },
        {
          "code": "restorative",
          "label": "Restorative"
        },
        {
          "code": "digital",
          "label": "Digital"
        },
        {
          "code": "non_play",
          "label": "Non-Play"
        }
      ],
      "columns": 3,
      "required": true,
      "source": "Sheet1 B83:G100"
    },
    {
      "id": "play_subtype_1",
      "code": "PlaySubtype1",
      "exportColumn": "",
      "act": "Play",
      "label": "Which kind of play?",
      "kind": "one",
      "options": [],
      "columns": 2,
      "required": false,
      "dependsOn": {
        "kind": "answered",
        "question": "play_type_1"
      },
      "openedBy": "Subtypes follow the primary play type you chose",
      "dynamicFrom": {
        "question": "play_type_1",
        "sets": {
          "physical": {
            "code": "Phys_Subtype",
            "exportColumn": "Phys_Subtype",
            "label": "Physical play — which kind?",
            "options": [
              {
                "code": "gross_motor",
                "label": "Gross motor"
              },
              {
                "code": "fine_motor",
                "label": "Fine motor"
              },
              {
                "code": "vestibular",
                "label": "Vestibular"
              },
              {
                "code": "rough_and_tumble",
                "label": "Rough & tumble"
              }
            ]
          },
          "exploratory": {
            "code": "Expl_Subtype",
            "exportColumn": "Expl_Subtype",
            "label": "Exploratory play — which kind?",
            "options": [
              {
                "code": "sensory",
                "label": "Sensory"
              },
              {
                "code": "active",
                "label": "Active"
              },
              {
                "code": "constructive",
                "label": "Constructive"
              }
            ]
          },
          "imaginative": {
            "code": "Imag_Subtype",
            "exportColumn": "Imag_Subtype",
            "label": "Imaginative play — which kind?",
            "options": [
              {
                "code": "symbolic",
                "label": "Symbolic"
              },
              {
                "code": "socio_dramatic",
                "label": "Socio-dramatic"
              },
              {
                "code": "fantasy",
                "label": "Fantasy"
              }
            ]
          },
          "play_with_rules": {
            "code": "PwR_Subtype",
            "exportColumn": "PwR_Subtype",
            "label": "Rules play — which kind?",
            "options": [
              {
                "code": "conventional",
                "label": "Conventional"
              },
              {
                "code": "organic",
                "label": "Organic"
              }
            ]
          },
          "bio": {
            "code": "Bio_Subtype",
            "exportColumn": "Bio_Subtype",
            "label": "Bio play — which kind?",
            "options": [
              {
                "code": "plants",
                "label": "Plants"
              },
              {
                "code": "wildlife",
                "label": "Wildlife"
              },
              {
                "code": "care",
                "label": "Care"
              }
            ]
          },
          "expressive": {
            "code": "Expr_Subtype",
            "exportColumn": "Expr_Subtype",
            "label": "Expressive play — which kind?",
            "options": [
              {
                "code": "performance",
                "label": "Performance"
              },
              {
                "code": "artistic",
                "label": "Artistic"
              },
              {
                "code": "language",
                "label": "Language"
              },
              {
                "code": "conversation",
                "label": "Conversation"
              }
            ]
          },
          "restorative": {
            "code": "Res_Subtype",
            "exportColumn": "Res_Subtype",
            "label": "Restorative — which kind?",
            "options": [
              {
                "code": "resting",
                "label": "Resting"
              },
              {
                "code": "retreat",
                "label": "Retreat"
              },
              {
                "code": "reading",
                "label": "Reading"
              },
              {
                "code": "onlooking",
                "label": "Onlooking"
              }
            ]
          },
          "digital": {
            "code": "Dig_Subtype",
            "exportColumn": "Dig_Subtype",
            "label": "Digital play — which kind?",
            "options": [
              {
                "code": "device",
                "label": "Device"
              },
              {
                "code": "augmented",
                "label": "Augmented"
              },
              {
                "code": "embedded",
                "label": "Embedded"
              }
            ]
          },
          "non_play": {
            "code": "Non_Subtype",
            "exportColumn": "Non_Subtype",
            "label": "Non-play — which kind?",
            "options": [
              {
                "code": "self_care",
                "label": "Self care"
              },
              {
                "code": "nutrition",
                "label": "Nutrition"
              },
              {
                "code": "distress",
                "label": "Distress"
              },
              {
                "code": "aggression",
                "label": "Aggression"
              },
              {
                "code": "transition",
                "label": "Transition"
              },
              {
                "code": "other",
                "label": "Other"
              }
            ]
          }
        }
      },
      "source": "Sheet1 B101:G133"
    },
    {
      "id": "play_type_2",
      "code": "PlayType2",
      "exportColumn": "Play_Type_2",
      "act": "Play",
      "label": "A second play type, if there is one",
      "hint": "Leave it unanswered when a single type describes the event.",
      "kind": "one",
      "options": [
        {
          "code": "physical",
          "label": "Physical"
        },
        {
          "code": "exploratory",
          "label": "Exploratory"
        },
        {
          "code": "imaginative",
          "label": "Imaginative"
        },
        {
          "code": "play_with_rules",
          "label": "Play with Rules"
        },
        {
          "code": "bio",
          "label": "Bio"
        },
        {
          "code": "expressive",
          "label": "Expressive"
        },
        {
          "code": "restorative",
          "label": "Restorative"
        },
        {
          "code": "digital",
          "label": "Digital"
        },
        {
          "code": "non_play",
          "label": "Non-Play"
        }
      ],
      "columns": 3,
      "required": false,
      "source": "Sheet1 B83:G100",
      "protocolFlag": "Whether the second slot is required is still a protocol decision. It is optional here and never blocks a save."
    },
    {
      "id": "play_subtype_2",
      "code": "PlaySubtype2",
      "exportColumn": "",
      "act": "Play",
      "label": "Which kind of play?",
      "kind": "one",
      "options": [],
      "columns": 2,
      "required": false,
      "dependsOn": {
        "kind": "answered",
        "question": "play_type_2"
      },
      "openedBy": "Subtypes follow the second play type you chose",
      "dynamicFrom": {
        "question": "play_type_2",
        "sets": {
          "physical": {
            "code": "Phys_Subtype",
            "exportColumn": "",
            "label": "Physical play — which kind?",
            "options": [
              {
                "code": "gross_motor",
                "label": "Gross motor"
              },
              {
                "code": "fine_motor",
                "label": "Fine motor"
              },
              {
                "code": "vestibular",
                "label": "Vestibular"
              },
              {
                "code": "rough_and_tumble",
                "label": "Rough & tumble"
              }
            ]
          },
          "exploratory": {
            "code": "Expl_Subtype",
            "exportColumn": "",
            "label": "Exploratory play — which kind?",
            "options": [
              {
                "code": "sensory",
                "label": "Sensory"
              },
              {
                "code": "active",
                "label": "Active"
              },
              {
                "code": "constructive",
                "label": "Constructive"
              }
            ]
          },
          "imaginative": {
            "code": "Imag_Subtype",
            "exportColumn": "",
            "label": "Imaginative play — which kind?",
            "options": [
              {
                "code": "symbolic",
                "label": "Symbolic"
              },
              {
                "code": "socio_dramatic",
                "label": "Socio-dramatic"
              },
              {
                "code": "fantasy",
                "label": "Fantasy"
              }
            ]
          },
          "play_with_rules": {
            "code": "PwR_Subtype",
            "exportColumn": "",
            "label": "Rules play — which kind?",
            "options": [
              {
                "code": "conventional",
                "label": "Conventional"
              },
              {
                "code": "organic",
                "label": "Organic"
              }
            ]
          },
          "bio": {
            "code": "Bio_Subtype",
            "exportColumn": "",
            "label": "Bio play — which kind?",
            "options": [
              {
                "code": "plants",
                "label": "Plants"
              },
              {
                "code": "wildlife",
                "label": "Wildlife"
              },
              {
                "code": "care",
                "label": "Care"
              }
            ]
          },
          "expressive": {
            "code": "Expr_Subtype",
            "exportColumn": "",
            "label": "Expressive play — which kind?",
            "options": [
              {
                "code": "performance",
                "label": "Performance"
              },
              {
                "code": "artistic",
                "label": "Artistic"
              },
              {
                "code": "language",
                "label": "Language"
              },
              {
                "code": "conversation",
                "label": "Conversation"
              }
            ]
          },
          "restorative": {
            "code": "Res_Subtype",
            "exportColumn": "",
            "label": "Restorative — which kind?",
            "options": [
              {
                "code": "resting",
                "label": "Resting"
              },
              {
                "code": "retreat",
                "label": "Retreat"
              },
              {
                "code": "reading",
                "label": "Reading"
              },
              {
                "code": "onlooking",
                "label": "Onlooking"
              }
            ]
          },
          "digital": {
            "code": "Dig_Subtype",
            "exportColumn": "",
            "label": "Digital play — which kind?",
            "options": [
              {
                "code": "device",
                "label": "Device"
              },
              {
                "code": "augmented",
                "label": "Augmented"
              },
              {
                "code": "embedded",
                "label": "Embedded"
              }
            ]
          },
          "non_play": {
            "code": "Non_Subtype",
            "exportColumn": "",
            "label": "Non-play — which kind?",
            "options": [
              {
                "code": "self_care",
                "label": "Self care"
              },
              {
                "code": "nutrition",
                "label": "Nutrition"
              },
              {
                "code": "distress",
                "label": "Distress"
              },
              {
                "code": "aggression",
                "label": "Aggression"
              },
              {
                "code": "transition",
                "label": "Transition"
              },
              {
                "code": "other",
                "label": "Other"
              }
            ]
          }
        }
      },
      "source": "Sheet1 B101:G133",
      "protocolFlag": "Slot two keeps its own answer and never shares slot one's values, but the test sheet supplies only one subtype set, so this answer has no export column yet."
    },
    {
      "id": "cars_intensity",
      "code": "CARS2",
      "exportColumn": "CARS",
      "act": "Play",
      "label": "How physically intense is it?",
      "hint": "The three supplied CARS bands. Bands are recorded as bands, never as a number.",
      "kind": "one",
      "options": [
        {
          "code": "cars_1_2",
          "label": "1–2 · stationary"
        },
        {
          "code": "cars_3",
          "label": "3 · slow"
        },
        {
          "code": "cars_4_5",
          "label": "4–5 · moderate to vigorous"
        }
      ],
      "columns": 1,
      "required": false,
      "source": "Sheet1 B135:G137"
    },
    {
      "id": "wildlife_interaction",
      "code": "Wildlife1",
      "exportColumn": "",
      "act": "Setting",
      "label": "Is the child interacting with wildlife?",
      "kind": "one",
      "options": [
        {
          "code": "no",
          "label": "No"
        },
        {
          "code": "yes",
          "label": "Yes"
        }
      ],
      "columns": 2,
      "required": false,
      "source": "Sheet1 B188:H197",
      "protocolFlag": "This branch has no supplied export columns. Answers are stored by question identifier until they are agreed."
    },
    {
      "id": "wildlife_type",
      "code": "Wildlife2",
      "exportColumn": "",
      "act": "Setting",
      "label": "What kind of interaction?",
      "kind": "one",
      "options": [],
      "columns": 2,
      "required": false,
      "dependsOn": {
        "kind": "equals",
        "question": "wildlife_interaction",
        "option": "yes"
      },
      "openedBy": "Opened by the wildlife answer",
      "source": "Sheet1 B188:H197",
      "protocolFlag": "Supply the interaction type list before this version is published. Nothing can be recorded here until then.",
      "optionsPending": "The workbook does not supply this list. It is left empty rather than filled with examples."
    },
    {
      "id": "wildlife_other",
      "code": "Wildlife3",
      "exportColumn": "",
      "act": "Setting",
      "label": "Describe the other kind of interaction",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": false,
      "dependsOn": {
        "kind": "equals",
        "question": "wildlife_interaction",
        "option": "yes"
      },
      "openedBy": "Opened by the wildlife answer",
      "placeholder": "Up to 100 characters",
      "rows": 2,
      "maxLength": 100,
      "source": "Sheet1 B188:H197",
      "protocolFlag": "The broad rule reveals this with the whole branch. Confirm whether it should appear only when the interaction type is Other."
    },
    {
      "id": "wildlife_description",
      "code": "Wildlife4",
      "exportColumn": "",
      "act": "Setting",
      "label": "Describe the wildlife interaction",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": false,
      "dependsOn": {
        "kind": "equals",
        "question": "wildlife_interaction",
        "option": "yes"
      },
      "openedBy": "Opened by the wildlife answer",
      "placeholder": "Up to 100 characters",
      "rows": 2,
      "maxLength": 100,
      "source": "Sheet1 B188:H197"
    },
    {
      "id": "observer_initials",
      "code": "Observer1",
      "exportColumn": "observer",
      "act": "Record",
      "label": "Who is observing?",
      "hint": "Up to ten uppercase characters. Carried into the next observation in this session.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": true,
      "placeholder": "e.g. JL",
      "rows": 1,
      "maxLength": 10,
      "source": "Sheet1 B4:G5"
    },
    {
      "id": "play_event_summary",
      "code": "Summary1",
      "exportColumn": "Play_Event_Summary",
      "act": "Record",
      "label": "Describe the play event",
      "hint": "A sentence or two, written as you saw it.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": true,
      "placeholder": "Two children dragging a large branch toward the mud kitchen, negotiating who steers…",
      "rows": 4,
      "maxLength": 1000,
      "source": "Sheet1 B42:G42"
    }
  ]
}$json$;
  zone_inventory constant jsonb := $json${
  "version": "janet-inventory-v1",
  "title": "Janet zone inventory",
  "summary": "Weather, wind, shade and the loose parts available in one zone, recorded at the start of a round.",
  "source": "Variables to use for App testing.xlsx, Sheet1 rows 13–32 — see docs/Janet-Test-Form-Scope.md",
  "status": "draft",
  "inclusion": "Climate (Sheet1 rows 13–17) and the loose-parts inventory by zone (rows 19–32), asked once per zone in an Inventory round. Excludes the eight hidden inventory rows (33–40). Option codes are provisional implementation identifiers and are not workbook values.",
  "knownExportCollisions": [],
  "protocolNotes": [
    {
      "id": "none-option",
      "title": "Each quantity has a None option",
      "detail": "The workbook's quantity bands start at Small (3 items or less) and its display rule reads 'if YES'. A None option records absence explicitly, and the list of items opens for any quantity except None. Confirm before research use.",
      "source": "Sheet1 H19, H21, H23, H25, H27, H29, H31"
    },
    {
      "id": "inventory-checklists",
      "title": "The inventory checklists are typed for now",
      "detail": "The workbook asks for a checklist of common items with room for custom ones, but the common list has not been supplied. Observers type what is available, so no item list is invented from the examples.",
      "source": "Sheet1 G20, G22, G24, G26, G28, G30, G32"
    },
    {
      "id": "climate-per-zone",
      "title": "Climate is recorded with each zone",
      "detail": "Weather, wind and shade are asked with each zone's inventory, as Janet asked on 2026-10-07. If climate should be recorded once per round instead, it moves to the round.",
      "source": "Janet, 2026-10-07 · Sheet1 B13:G17"
    },
    {
      "id": "hidden-inventory-rows",
      "title": "Four hidden inventory groups stay excluded",
      "detail": "Sand, mud and water toys, household items, sporting equipment and riding equipment (Sheet1 rows 33–40) are hidden in the workbook and stay out, as for the first test form.",
      "source": "Sheet1 rows 33–40"
    }
  ],
  "questions": [
    {
      "id": "weather",
      "code": "Climate1",
      "exportColumn": "Weather",
      "act": "Climate",
      "label": "What is the weather right now?",
      "hint": "Select every option that applies.",
      "kind": "many",
      "options": [
        {
          "code": "full_sun",
          "label": "Full sun"
        },
        {
          "code": "partial_sun",
          "label": "Partial sun or cloud"
        },
        {
          "code": "overcast",
          "label": "Cloudy or overcast"
        },
        {
          "code": "fog",
          "label": "Foggy or misty"
        },
        {
          "code": "light_rain",
          "label": "Light rain"
        },
        {
          "code": "heavy_rain",
          "label": "Heavy rain"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B13:G13"
    },
    {
      "id": "wind",
      "code": "Climate2",
      "exportColumn": "Wind",
      "act": "Climate",
      "label": "How windy is it?",
      "hint": "The option that fits best.",
      "kind": "one",
      "options": [
        {
          "code": "no_wind",
          "label": "No wind"
        },
        {
          "code": "light_wind",
          "label": "Light wind"
        },
        {
          "code": "heavy_wind",
          "label": "Heavy wind"
        },
        {
          "code": "gusts",
          "label": "Occasional gusts"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B15:G15"
    },
    {
      "id": "shade",
      "code": "Climate3",
      "exportColumn": "Shade",
      "act": "Climate",
      "label": "How much of this zone is shaded?",
      "hint": "The option that fits best.",
      "kind": "one",
      "options": [
        {
          "code": "full_sun",
          "label": "Full sun"
        },
        {
          "code": "partial_shade",
          "label": "Partial shade"
        },
        {
          "code": "dappled_shade",
          "label": "Dappled shade"
        },
        {
          "code": "full_shade",
          "label": "Full shade"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B17:G17"
    },
    {
      "id": "inv_nat_surfaces",
      "code": "LP Inventory 1",
      "exportColumn": "Inv_Nat_Surfaces",
      "act": "Inventory",
      "label": "Natural ground surfaces and loose materials",
      "hint": "E.g. sand, water, mud, mulch, loose hay, loose grass.",
      "kind": "one",
      "options": [
        {
          "code": "none",
          "label": "None available"
        },
        {
          "code": "small",
          "label": "Small quantity · 3 items or less"
        },
        {
          "code": "moderate",
          "label": "Moderate quantity · 4 to 10 items"
        },
        {
          "code": "large",
          "label": "Large quantity · more than 10 items"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B19:H20"
    },
    {
      "id": "inv_nat_surfaces_list",
      "code": "LP Inventory 2",
      "exportColumn": "Inv_Nat_Surfaces_List",
      "act": "Inventory",
      "label": "Which ones are available?",
      "hint": "Type what is in this zone now, separated by commas.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": false,
      "dependsOn": {
        "kind": "all",
        "of": [
          {
            "kind": "answered",
            "question": "inv_nat_surfaces"
          },
          {
            "kind": "notEquals",
            "question": "inv_nat_surfaces",
            "option": "none"
          }
        ]
      },
      "openedBy": "Opened by the quantity you chose",
      "placeholder": "e.g. sand, mulch",
      "rows": 2,
      "maxLength": 300,
      "source": "Sheet1 B19:H20",
      "protocolFlag": "The workbook asks for a checklist of common items with room for custom ones, but the common list has not been supplied. Observers type what is available until it is."
    },
    {
      "id": "inv_nat_lps_sm",
      "code": "LP Inventory 3",
      "exportColumn": "Inv_Nat_LPs_Sm",
      "act": "Inventory",
      "label": "Small natural loose parts",
      "hint": "Light, easy to move or handle. E.g. acorns, pinecones, sticks, flowers, weeds, leaves, small rocks or pebbles, feathers, bugs, fruit.",
      "kind": "one",
      "options": [
        {
          "code": "none",
          "label": "None available"
        },
        {
          "code": "small",
          "label": "Small quantity · 3 items or less"
        },
        {
          "code": "moderate",
          "label": "Moderate quantity · 4 to 10 items"
        },
        {
          "code": "large",
          "label": "Large quantity · more than 10 items"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B21:H22"
    },
    {
      "id": "inv_nat_lps_sm_list",
      "code": "LP Inventory 4",
      "exportColumn": "Inv_Nat_LPs_Sm_List",
      "act": "Inventory",
      "label": "Which ones are available?",
      "hint": "Type what is in this zone now, separated by commas.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": false,
      "dependsOn": {
        "kind": "all",
        "of": [
          {
            "kind": "answered",
            "question": "inv_nat_lps_sm"
          },
          {
            "kind": "notEquals",
            "question": "inv_nat_lps_sm",
            "option": "none"
          }
        ]
      },
      "openedBy": "Opened by the quantity you chose",
      "placeholder": "e.g. sticks, pinecones",
      "rows": 2,
      "maxLength": 300,
      "source": "Sheet1 B21:H22",
      "protocolFlag": "The workbook asks for a checklist of common items with room for custom ones, but the common list has not been supplied. Observers type what is available until it is."
    },
    {
      "id": "inv_nat_lps_med",
      "code": "LP Inventory 5",
      "exportColumn": "Inv_Nat_LPs_Med",
      "act": "Inventory",
      "label": "Medium natural loose parts",
      "hint": "A bit of weight, relatively easy to handle or move. E.g. tree cookies, medium rocks, small stumps, small logs, large sticks, medium branches, bamboo poles.",
      "kind": "one",
      "options": [
        {
          "code": "none",
          "label": "None available"
        },
        {
          "code": "small",
          "label": "Small quantity · 3 items or less"
        },
        {
          "code": "moderate",
          "label": "Moderate quantity · 4 to 10 items"
        },
        {
          "code": "large",
          "label": "Large quantity · more than 10 items"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B23:H24"
    },
    {
      "id": "inv_nat_lps_med_list",
      "code": "LP Inventory 6",
      "exportColumn": "Inv_Nat_LPs_Med_List",
      "act": "Inventory",
      "label": "Which ones are available?",
      "hint": "Type what is in this zone now, separated by commas.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": false,
      "dependsOn": {
        "kind": "all",
        "of": [
          {
            "kind": "answered",
            "question": "inv_nat_lps_med"
          },
          {
            "kind": "notEquals",
            "question": "inv_nat_lps_med",
            "option": "none"
          }
        ]
      },
      "openedBy": "Opened by the quantity you chose",
      "placeholder": "e.g. tree cookies, small logs",
      "rows": 2,
      "maxLength": 300,
      "source": "Sheet1 B23:H24",
      "protocolFlag": "The workbook asks for a checklist of common items with room for custom ones, but the common list has not been supplied. Observers type what is available until it is."
    },
    {
      "id": "inv_nat_lps_lrg",
      "code": "LP Inventory 7",
      "exportColumn": "Inv_Nat_LPs_Lrg",
      "act": "Inventory",
      "label": "Large natural loose parts",
      "hint": "Heavy, more difficult to handle or move. E.g. large stumps, large rocks, medium to large logs, medium to large branches.",
      "kind": "one",
      "options": [
        {
          "code": "none",
          "label": "None available"
        },
        {
          "code": "small",
          "label": "Small quantity · 3 items or less"
        },
        {
          "code": "moderate",
          "label": "Moderate quantity · 4 to 10 items"
        },
        {
          "code": "large",
          "label": "Large quantity · more than 10 items"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B25:H26"
    },
    {
      "id": "inv_nat_lps_lrg_list",
      "code": "LP Inventory 8",
      "exportColumn": "Inv_Nat_LPs_Lrg_List",
      "act": "Inventory",
      "label": "Which ones are available?",
      "hint": "Type what is in this zone now, separated by commas.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": false,
      "dependsOn": {
        "kind": "all",
        "of": [
          {
            "kind": "answered",
            "question": "inv_nat_lps_lrg"
          },
          {
            "kind": "notEquals",
            "question": "inv_nat_lps_lrg",
            "option": "none"
          }
        ]
      },
      "openedBy": "Opened by the quantity you chose",
      "placeholder": "e.g. large stumps",
      "rows": 2,
      "maxLength": 300,
      "source": "Sheet1 B25:H26",
      "protocolFlag": "The workbook asks for a checklist of common items with room for custom ones, but the common list has not been supplied. Observers type what is available until it is."
    },
    {
      "id": "inv_mfgd_lps_sm",
      "code": "LP Inventory 9",
      "exportColumn": "Inv_Mfgd_LPs_Sm",
      "act": "Inventory",
      "label": "Small manufactured loose parts",
      "hint": "Light, easy to move or handle; sensory play items. E.g. small to medium blocks, bubbles, books, musical instruments, art materials such as chalk, paint or crayons, binoculars or magnifiers.",
      "kind": "one",
      "options": [
        {
          "code": "none",
          "label": "None available"
        },
        {
          "code": "small",
          "label": "Small quantity · 3 items or less"
        },
        {
          "code": "moderate",
          "label": "Moderate quantity · 4 to 10 items"
        },
        {
          "code": "large",
          "label": "Large quantity · more than 10 items"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B27:H28"
    },
    {
      "id": "inv_mfgd_lps_sm_list",
      "code": "LP Inventory 10",
      "exportColumn": "Inv_Mfgd_LPs_Sm_List",
      "act": "Inventory",
      "label": "Which ones are available?",
      "hint": "Type what is in this zone now, separated by commas.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": false,
      "dependsOn": {
        "kind": "all",
        "of": [
          {
            "kind": "answered",
            "question": "inv_mfgd_lps_sm"
          },
          {
            "kind": "notEquals",
            "question": "inv_mfgd_lps_sm",
            "option": "none"
          }
        ]
      },
      "openedBy": "Opened by the quantity you chose",
      "placeholder": "e.g. chalk, blocks",
      "rows": 2,
      "maxLength": 300,
      "source": "Sheet1 B27:H28",
      "protocolFlag": "The workbook asks for a checklist of common items with room for custom ones, but the common list has not been supplied. Observers type what is available until it is."
    },
    {
      "id": "inv_mfgd_lps_med",
      "code": "LP Inventory 11",
      "exportColumn": "Inv_Mfgd_LPs_Med",
      "act": "Inventory",
      "label": "Medium manufactured loose parts",
      "hint": "Mobile, but a bit heavier or harder to move. E.g. large blocks, pylons, small tires, milk crates, large tubs or pails, very small chairs, pool noodles.",
      "kind": "one",
      "options": [
        {
          "code": "none",
          "label": "None available"
        },
        {
          "code": "small",
          "label": "Small quantity · 3 items or less"
        },
        {
          "code": "moderate",
          "label": "Moderate quantity · 4 to 10 items"
        },
        {
          "code": "large",
          "label": "Large quantity · more than 10 items"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B29:H30"
    },
    {
      "id": "inv_mfgd_lps_med_list",
      "code": "LP Inventory 12",
      "exportColumn": "Inv_Mfgd_LPs_Med_List",
      "act": "Inventory",
      "label": "Which ones are available?",
      "hint": "Type what is in this zone now, separated by commas.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": false,
      "dependsOn": {
        "kind": "all",
        "of": [
          {
            "kind": "answered",
            "question": "inv_mfgd_lps_med"
          },
          {
            "kind": "notEquals",
            "question": "inv_mfgd_lps_med",
            "option": "none"
          }
        ]
      },
      "openedBy": "Opened by the quantity you chose",
      "placeholder": "e.g. milk crates, pylons",
      "rows": 2,
      "maxLength": 300,
      "source": "Sheet1 B29:H30",
      "protocolFlag": "The workbook asks for a checklist of common items with room for custom ones, but the common list has not been supplied. Observers type what is available until it is."
    },
    {
      "id": "inv_mfgd_lps_lrg",
      "code": "LP Inventory 13",
      "exportColumn": "Inv_Mfgd_LPs_Lrg",
      "act": "Inventory",
      "label": "Large manufactured loose parts or play equipment",
      "hint": "Mobile, but very heavy or not easily moved. E.g. a water or sand table, play kitchen, small climber, rocker or slide, large tires, chairs or a small bench, small table, ladder, large spools.",
      "kind": "one",
      "options": [
        {
          "code": "none",
          "label": "None available"
        },
        {
          "code": "small",
          "label": "Small quantity · 3 items or less"
        },
        {
          "code": "moderate",
          "label": "Moderate quantity · 4 to 10 items"
        },
        {
          "code": "large",
          "label": "Large quantity · more than 10 items"
        }
      ],
      "columns": 2,
      "required": true,
      "source": "Sheet1 B31:H32"
    },
    {
      "id": "inv_mfgd_lps_lrg_list",
      "code": "LP Inventory 14",
      "exportColumn": "Inv_Mfgd_LPs_Lrg_List",
      "act": "Inventory",
      "label": "Which ones are available?",
      "hint": "Type what is in this zone now, separated by commas.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": false,
      "dependsOn": {
        "kind": "all",
        "of": [
          {
            "kind": "answered",
            "question": "inv_mfgd_lps_lrg"
          },
          {
            "kind": "notEquals",
            "question": "inv_mfgd_lps_lrg",
            "option": "none"
          }
        ]
      },
      "openedBy": "Opened by the quantity you chose",
      "placeholder": "e.g. sand table, large tires",
      "rows": 2,
      "maxLength": 300,
      "source": "Sheet1 B31:H32",
      "protocolFlag": "The workbook asks for a checklist of common items with room for custom ones, but the common list has not been supplied. Observers type what is available until it is."
    },
    {
      "id": "observer_initials",
      "code": "Observer1",
      "exportColumn": "observer",
      "act": "Record",
      "label": "Who is observing?",
      "hint": "Up to ten uppercase characters. Carried into the next zone in this session.",
      "kind": "text",
      "options": [],
      "columns": 1,
      "required": true,
      "placeholder": "e.g. JL",
      "rows": 1,
      "maxLength": 10,
      "source": "Sheet1 B5:G5"
    }
  ]
}$json$;
  ground_input constant jsonb := $json${"type":"Polygon","coordinates":[[[-76.487099,42.446538],[-76.4864245,42.446538],[-76.4864245,42.4462101],[-76.487099,42.4462101],[-76.487099,42.446538]]]}$json$;
  zones_input constant jsonb := $json$[{"zone_id":"10000000-0000-4000-8000-000000000107","zone_code":"A","zone_label":"Lawn bed","geometry":{"type":"Polygon","coordinates":[[[-76.4870369,42.4464922],[-76.4868129,42.4464922],[-76.4868129,42.4462604],[-76.4870369,42.4462604],[-76.4870369,42.4464922]]]}},{"zone_id":"10000000-0000-4000-8000-000000000108","zone_code":"B","zone_label":"Sand bed","geometry":{"type":"Polygon","coordinates":[[[-76.4866948,42.4464922],[-76.4864866,42.4464922],[-76.4864866,42.4464015],[-76.4866948,42.4464015],[-76.4866948,42.4464922]]]}}]$json$;
  layer_ground constant jsonb := $json${"type":"FeatureCollection","features":[{"type":"Feature","properties":{"kind":"site","id":"site","name":"Practice garden"},"geometry":{"type":"Polygon","coordinates":[[[-76.487099,42.446538],[-76.4864245,42.446538],[-76.4864245,42.4462101],[-76.487099,42.4462101],[-76.487099,42.446538]]]}},{"type":"Feature","properties":{"kind":"grass","id":"grass-1"},"geometry":{"type":"Polygon","coordinates":[[[-76.4870539,42.4465048],[-76.4867958,42.4465048],[-76.4867958,42.4462434],[-76.4870539,42.4462434],[-76.4870539,42.4465048]]]}},{"type":"Feature","properties":{"kind":"dirt","id":"dirt-1"},"geometry":{"type":"Polygon","coordinates":[[[-76.4867167,42.4465048],[-76.4864696,42.4465048],[-76.4864696,42.4463889],[-76.4867167,42.4463889],[-76.4867167,42.4465048]]]}},{"type":"Feature","properties":{"kind":"mulch","id":"mulch-1"},"geometry":{"type":"Polygon","coordinates":[[[-76.4867167,42.4463593],[-76.4864696,42.4463593],[-76.4864696,42.4462434],[-76.4867167,42.4462434],[-76.4867167,42.4463593]]]}},{"type":"Feature","properties":{"kind":"equipment","id":"equipment-1","name":"Balance beam"},"geometry":{"type":"Polygon","coordinates":[[[-76.4866437,42.4463305],[-76.4865365,42.4463305],[-76.4865365,42.4462766],[-76.4866437,42.4462766],[-76.4866437,42.4463305]]]}}]}$json$;
  layer_paths constant jsonb := $json${"type":"FeatureCollection","features":[{"type":"Feature","properties":{"kind":"path","id":"path-1","width_m":2.2},"geometry":{"type":"LineString","coordinates":[[-76.4867532,42.446538],[-76.4867532,42.4462101]]}}]}$json$;
  layer_trees constant jsonb := $json${"type":"FeatureCollection","features":[{"type":"Feature","properties":{"kind":"tree","id":"tree-01","radius_m":2.5},"geometry":{"type":"Point","coordinates":[-76.487015,42.446476]}},{"type":"Feature","properties":{"kind":"tree","id":"tree-02","radius_m":2.5},"geometry":{"type":"Point","coordinates":[-76.4869748,42.4463431]}},{"type":"Feature","properties":{"kind":"tree","id":"tree-03","radius_m":2.5},"geometry":{"type":"Point","coordinates":[-76.4868689,42.4462928]}}]}$json$;
  zone jsonb; canonical jsonb; shape extensions.geometry; anchor extensions.geometry; extent extensions.box3d;
  digest text; ground extensions.geometry; zones jsonb := '[]'; manifest_zones jsonb := '[]'; features jsonb := '[]';
  manifest jsonb; zone_layer jsonb; archive bytea; request jsonb; checks jsonb;
BEGIN
  -- Only a database that has not been used against the old seed. A used one is reset first (D31, OPS-19).
  IF EXISTS (SELECT FROM fieldmaps.observations WHERE form_version_id IN (old_shell, play))
    OR EXISTS (SELECT FROM fieldmaps.site_packages WHERE form_version_id IN (old_shell, play)
      OR inventory_form_version_id IN (old_shell, play) OR site_id = site)
    OR EXISTS (SELECT FROM fieldmaps.zone_drafts WHERE inventory_form_version_id IN (old_shell, play) OR site_id = site) THEN
    RAISE EXCEPTION 'DB-20 replaces the seeded Training and practice forms, and records or packages already use them; reset the database first'
      USING ERRCODE = '23514';
  END IF;

  -- 1. The seed rows that were mismatched and legacy-shaped.
  ALTER TABLE fieldmaps.form_versions DISABLE TRIGGER immutable_form_version;
  DELETE FROM fieldmaps.form_versions WHERE id IN (old_shell, play);
  ALTER TABLE fieldmaps.form_versions ENABLE TRIGGER immutable_form_version;
  DELETE FROM fieldmaps.forms WHERE id = old_shell_form;

  -- 2. Training's forms. A version is stamped with its own code and its state, as the API stamps one.
  UPDATE fieldmaps.forms SET name = 'Training' WHERE id = play_form;
  INSERT INTO fieldmaps.forms(id, organization_id, project_id, code, name)
  VALUES (inventory_form, org, project, 'training-inventory', 'Training inventory');
  INSERT INTO fieldmaps.form_versions(id, organization_id, project_id, code, definition, form_id, version,
    state, schema_version, published_at)
  VALUES
    (play, org, project, 'training-v1',
      behaviour_mapping || '{"version":"training-v1","status":"published"}', play_form, 1,
      'published', schema_number, now()),
    (inventory, org, project, 'training-inventory-v1',
      zone_inventory || '{"version":"training-inventory-v1","status":"published"}', inventory_form, 1,
      'published', schema_number, now());

  -- The Practice garden: the site that was already seeded, now with a package.
  UPDATE fieldmaps.sites SET name = 'Practice garden',
    description = 'A small garden with two zones, for practice. Only you see what you record here.'
  WHERE id = site;
  ground := extensions.ST_GeomFromGeoJSON(fieldmaps_private.normalize_zone_geometry(ground_input, 2147483647));
  FOR zone IN SELECT value FROM jsonb_array_elements(zones_input) ORDER BY value ->> 'zone_code' COLLATE "C" LOOP
    canonical := fieldmaps_private.normalize_zone_geometry(zone -> 'geometry');
    shape := extensions.ST_GeomFromGeoJSON(canonical);
    anchor := extensions.ST_PointOnSurface(shape);
    extent := shape::extensions.box3d;
    digest := fieldmaps_private.zone_geometry_digest(canonical);
    zones := zones || jsonb_build_array(zone || jsonb_build_object('geometry', canonical,
      'display_anchor', jsonb_build_array(extensions.ST_X(anchor), extensions.ST_Y(anchor)),
      'geometry_sha256', digest));
    manifest_zones := manifest_zones || jsonb_build_array(jsonb_build_object('label', zone -> 'zone_label',
      'bbox', jsonb_build_array(extensions.ST_XMin(extent), extensions.ST_YMin(extent),
        extensions.ST_XMax(extent), extensions.ST_YMax(extent)),
      'zone_id', zone -> 'zone_id', 'zone_code', zone -> 'zone_code',
      'display_anchor', jsonb_build_array(extensions.ST_X(anchor), extensions.ST_Y(anchor)),
      'geometry_sha256', digest));
    features := features || jsonb_build_array(jsonb_build_object('type', 'Feature', 'geometry', canonical,
      'properties', jsonb_build_object('zone_id', zone -> 'zone_id', 'zone_code', zone -> 'zone_code',
        'name', zone -> 'zone_label', 'display_anchor',
        jsonb_build_array(extensions.ST_X(anchor), extensions.ST_Y(anchor)), 'geometry_sha256', digest)));
  END LOOP;
  manifest := jsonb_build_object('format', 1, 'site_id', site, 'site_code', 'training-garden',
    'package_id', package, 'package_version', 1,
    'forms', jsonb_build_object(
      'play', jsonb_build_object('form_version_id', play, 'form_version', 'training-v1'),
      'inventory', jsonb_build_object('form_version_id', inventory, 'form_version', 'training-inventory-v1')),
    'zones', manifest_zones);
  zone_layer := jsonb_build_object('type', 'FeatureCollection', 'features', features);
  archive := pg_temp.seed_zip(
    ARRAY['manifest.json', 'layers/ground.json', 'layers/paths.json', 'layers/trees.json', 'layers/zones.json'],
    ARRAY[convert_to(manifest::text, 'UTF8'), convert_to(layer_ground::text, 'UTF8'),
      convert_to(layer_paths::text, 'UTF8'), convert_to(layer_trees::text, 'UTF8'),
      convert_to(zone_layer::text, 'UTF8')]);
  checks := jsonb_build_array(
    jsonb_build_object('step', 'source-project', 'state', 'skipped',
      'detail', 'The Practice garden is seeded with the database; no QGIS project was read.'),
    jsonb_build_object('step', 'layer-sources', 'state', 'passed',
      'detail', '4 layers supplied directly: ground, paths, trees, zones'),
    jsonb_build_object('step', 'coordinate-reference', 'state', 'passed',
      'detail', '4 layers in WGS 84 longitude/latitude, as the database and the collector both read'),
    jsonb_build_object('step', 'imagery-licence', 'state', 'passed',
      'detail', 'Vector only; no raster imagery was referenced'),
    jsonb_build_object('step', 'archive', 'state', 'passed',
      'detail', format('4 layers, %s zones, %s KB', jsonb_array_length(zones), length(archive) / 1024)));

  -- The rows the zone publication function writes for a first package, in its order.
  INSERT INTO fieldmaps.site_packages(id, organization_id, project_id, site_id, form_version_id, version, state,
    manifest, archive, archive_sha256, prepared_by, site_boundary, inventory_form_version_id)
  VALUES (package, org, project, site, play, 1, 'ready', manifest, archive, encode(sha256(archive), 'hex'),
    author, ground, inventory);
  INSERT INTO fieldmaps.package_checks(package_id, position, step, state, detail)
  SELECT package, ordinal - 1, value ->> 'step', value ->> 'state', value ->> 'detail'
  FROM jsonb_array_elements(checks) WITH ORDINALITY c(value, ordinal);
  FOR zone IN SELECT value FROM jsonb_array_elements(zones) LOOP
    INSERT INTO fieldmaps.zone_identities(id, organization_id, project_id, site_id, code, created_by)
    VALUES ((zone ->> 'zone_id')::uuid, org, project, site, zone ->> 'zone_code', author);
    shape := extensions.ST_GeomFromGeoJSON(zone -> 'geometry');
    INSERT INTO fieldmaps.package_zones(organization_id, project_id, site_id, package_id, zone_id, label, geom,
      display_anchor, geometry_sha256, canonical_geometry)
    VALUES (org, project, site, package, (zone ->> 'zone_id')::uuid, zone ->> 'zone_label', shape,
      extensions.ST_SetSRID(extensions.ST_MakePoint((zone #>> '{display_anchor,0}')::double precision,
        (zone #>> '{display_anchor,1}')::double precision), 4326),
      zone ->> 'geometry_sha256', zone -> 'geometry');
  END LOOP;
  request := jsonb_build_object('operation', 'package_import', 'seed', 'training', 'site_id', site,
    'package_id', package);
  INSERT INTO fieldmaps.zone_publications(request_id, created_by, organization_id, project_id, site_id, operation,
    expected_current_package_id, request_hash, request, published_package_id, identity_map, change_note)
  VALUES (package, author, org, project, site, 'package_import', NULL,
    encode(sha256(convert_to(request::text, 'UTF8')), 'hex'), request, package,
    (SELECT jsonb_agg(jsonb_build_object('zone_id', z ->> 'zone_id', 'zone_code', z ->> 'zone_code'))
     FROM jsonb_array_elements(zones) z), 'The Practice garden, seeded with the database');
  INSERT INTO fieldmaps.site_zone_state(site_id, organization_id, project_id, current_package_id, revision)
  VALUES (site, org, project, package, 1);

  -- 3. Templates: what the web's "start from" lists today, now in the database (D32).
  INSERT INTO fieldmaps.form_templates(code, title, summary, definition, schema_version)
  VALUES
    ('behaviour-mapping', 'Behaviour mapping',
      'The child''s age range, up to two play types with their kinds of play, how intense it is, wildlife and a description of the play. Asked at each observation.',
      behaviour_mapping, schema_number),
    ('zone-inventory', 'Zone inventory',
      'Weather, wind and shade, then the natural and manufactured loose parts a zone has. Asked once per zone in an Inventory round.',
      zone_inventory, schema_number);
END;
$seed$;
