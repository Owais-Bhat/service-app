import { api } from './client';

export interface DeviceTakenLog {
  id: string;
  inquiry_id: string;
  employee_id: string;
  device_description: string | null;
  device_image_url: string | null;
  taken_at: string;
  profiles?: { full_name: string };
}

export interface DeviceReturnLog {
  id: string;
  inquiry_id: string;
  device_condition: string;
  return_notes: string | null;
  return_image_url: string | null;
  returned_at: string;
}

export interface DeviceFollowUpLog {
  id: string;
  inquiry_id: string;
  status: string;
  notes: string | null;
  updated_by: string;
  created_at: string;
  profiles?: { full_name: string };
}

export interface EmployeeDevice {
  id: string;
  ticket_no: string;
  full_name: string;
  phone: string;
  service_item: string;
  address: string | null;
  company_name: string | null;
  device_type: string | null;
  device_serial_no: string | null;
  preferred_time: string | null;
  bill_no: string | null;
  device_status: string | null;
  follow_up_status: string | null;
  device_service_enabled: number | boolean | null;
  status: string;
  created_at: string;
  device_taken_logs: DeviceTakenLog | null;
  device_return_logs: DeviceReturnLog | null;
}

export interface DeviceStatusDetail {
  inquiry: { device_status: string | null; follow_up_status: string | null };
  device_taken_logs: DeviceTakenLog | null;
  device_return_logs: DeviceReturnLog | null;
  device_follow_up_logs: DeviceFollowUpLog[];
}

export async function fetchEmployeeDevices(employeeId: string): Promise<EmployeeDevice[]> {
  return api.get<EmployeeDevice[]>(`/device-tracking/employee/${employeeId}`);
}

export async function fetchDeviceStatus(inquiryId: string): Promise<DeviceStatusDetail> {
  return api.get<DeviceStatusDetail>(`/device-tracking/status/${inquiryId}`);
}

export async function markDeviceTaken(inquiryId: string, description: string, imageUrl?: string | null): Promise<void> {
  await api.post(`/device-tracking/taken`, {
    inquiry_id: inquiryId,
    description: description || null,
    device_image_url: imageUrl || null,
  });
}

export async function logFollowUp(inquiryId: string, status: string, notes: string): Promise<void> {
  await api.post(`/device-tracking/followup`, { inquiry_id: inquiryId, status, notes: notes || null });
}

export async function markDeviceReturned(inquiryId: string, condition: string, notes: string, imageUrl?: string | null): Promise<void> {
  await api.post(`/device-tracking/return`, {
    inquiry_id: inquiryId,
    device_condition: condition,
    return_notes: notes || null,
    return_image_url: imageUrl || null,
  });
}
