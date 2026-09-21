PRAGMA foreign_keys = ON;

ALTER TABLE research_preferences ADD COLUMN automatic_report_enabled INTEGER NOT NULL DEFAULT 1 CHECK (automatic_report_enabled IN (0, 1));
ALTER TABLE research_preferences ADD COLUMN report_weekday INTEGER NOT NULL DEFAULT 0 CHECK (report_weekday BETWEEN 0 AND 6);
ALTER TABLE research_preferences ADD COLUMN report_time TEXT NOT NULL DEFAULT '07:00' CHECK (length(report_time) = 5 AND substr(report_time, 3, 1) = ':' AND substr(report_time, 1, 2) BETWEEN '00' AND '23' AND substr(report_time, 4, 2) IN ('00', '30'));
ALTER TABLE research_preferences ADD COLUMN report_timezone TEXT NOT NULL DEFAULT 'Asia/Taipei';
ALTER TABLE research_preferences ADD COLUMN report_model TEXT NOT NULL DEFAULT 'gpt-5.6-terra';
ALTER TABLE research_preferences ADD COLUMN include_cash_in_analysis INTEGER NOT NULL DEFAULT 0 CHECK (include_cash_in_analysis IN (0, 1));
ALTER TABLE research_preferences ADD COLUMN include_futures_in_analysis INTEGER NOT NULL DEFAULT 0 CHECK (include_futures_in_analysis IN (0, 1));

PRAGMA user_version = 17;
PRAGMA optimize;
