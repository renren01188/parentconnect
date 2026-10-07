-- Limit attendance SMS to RFID events only. This updates existing deployments
-- that already have the attendance_logs_enqueue_sms trigger installed.

drop trigger if exists attendance_logs_enqueue_sms on public.attendance_logs;
create trigger attendance_logs_enqueue_sms
after insert on public.attendance_logs
for each row
when (new.via = 'RFID')
execute function public.enqueue_attendance_sms_job();
