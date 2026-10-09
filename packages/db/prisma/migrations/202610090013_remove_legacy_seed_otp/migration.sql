-- Retire the fixed test-code challenge inserted by pre-Pass-5 development seeds.
DELETE FROM "OtpChallenge" WHERE "id" = 'seed-demo-otp';
