// Device Tracking Module
import { supabase } from '../supabase.js';
import { toast, formatDateTime } from '../utils.js';

const API_URL = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

// Load device taken log for an inquiry
export async function loadDeviceTakenLog(inquiryId) {
  try {
    const { data, error } = await supabase
      .from('device_taken_logs')
      .select('*, profiles(full_name)')
      .eq('inquiry_id', inquiryId)
      .order('taken_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data, error };
  } catch (err) {
    console.error('Error loading device taken log:', err);
    return { data: null, error: err };
  }
}

// Load device return log for an inquiry
export async function loadDeviceReturnLog(inquiryId) {
  try {
    const { data, error } = await supabase
      .from('device_return_logs')
      .select('*')
      .eq('inquiry_id', inquiryId)
      .order('returned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data, error };
  } catch (err) {
    console.error('Error loading device return log:', err);
    return { data: null, error: err };
  }
}

// Load device follow-up logs
export async function loadDeviceFollowUpLogs(inquiryId) {
  try {
    const { data, error } = await supabase
      .from('device_follow_up_logs')
      .select('*, profiles(full_name)')
      .eq('inquiry_id', inquiryId)
      .order('created_at', { ascending: false });
    return { data: data || [], error };
  } catch (err) {
    console.error('Error loading device follow-up logs:', err);
    return { data: [], error: err };
  }
}

// Save device taken with image
export async function saveDeviceTaken(inquiryId, employeeId, imageFile, description) {
  try {
    let imageUrl = null;

    // Upload image if provided
    if (imageFile) {
      const fileName = `device-taken-${inquiryId}-${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('device-tracking')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('device-tracking')
        .getPublicUrl(fileName);

      imageUrl = publicUrlData?.publicUrl;
    }

    // Save device taken log
    const { data, error } = await supabase
      .from('device_taken_logs')
      .insert({
        id: crypto.randomUUID(),
        inquiry_id: inquiryId,
        employee_id: employeeId,
        device_image_url: imageUrl,
        device_description: description,
        taken_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update inquiry device_status
    await supabase
      .from('inquiries')
      .update({ device_status: 'taken' })
      .eq('id', inquiryId);

    return { data, error: null };
  } catch (err) {
    console.error('Error saving device taken:', err);
    return { data: null, error: err };
  }
}

// Save device return with image
export async function saveDeviceReturn(inquiryId, imageFile, condition, notes) {
  try {
    let imageUrl = null;

    // Upload image if provided
    if (imageFile) {
      const fileName = `device-return-${inquiryId}-${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('device-tracking')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('device-tracking')
        .getPublicUrl(fileName);

      imageUrl = publicUrlData?.publicUrl;
    }

    // Save device return log
    const { data, error } = await supabase
      .from('device_return_logs')
      .insert({
        id: crypto.randomUUID(),
        inquiry_id: inquiryId,
        device_condition: condition,
        return_image_url: imageUrl,
        return_notes: notes,
        returned_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update inquiry device_status
    await supabase
      .from('inquiries')
      .update({ device_status: 'returned' })
      .eq('id', inquiryId);

    return { data, error: null };
  } catch (err) {
    console.error('Error saving device return:', err);
    return { data: null, error: err };
  }
}

// Add follow-up status update
export async function saveFollowUpStatus(inquiryId, status, notes, userId) {
  try {
    const { data, error } = await supabase
      .from('device_follow_up_logs')
      .insert({
        id: crypto.randomUUID(),
        inquiry_id: inquiryId,
        status,
        notes,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) throw error;

    // Update inquiry follow_up_status
    await supabase
      .from('inquiries')
      .update({ follow_up_status: status })
      .eq('id', inquiryId);

    return { data, error: null };
  } catch (err) {
    console.error('Error saving follow-up status:', err);
    return { data: null, error: err };
  }
}

// Get all device tracking data for admin panel
export async function getAllDeviceTracking() {
  try {
    const { data, error } = await supabase
      .from('inquiries')
      .select(`
        id,
        ticket_no,
        full_name,
        phone,
        service_item,
        device_status,
        follow_up_status,
        status,
        created_at,
        device_taken_logs(
          id,
          employee_id,
          device_image_url,
          device_description,
          taken_at,
          profiles(full_name)
        ),
        device_return_logs(
          id,
          device_condition,
          return_image_url,
          return_notes,
          returned_at
        ),
        device_follow_up_logs(
          id,
          status,
          notes,
          created_at,
          profiles(full_name)
        )
      `)
      .order('created_at', { ascending: false });

    return { data: data || [], error };
  } catch (err) {
    console.error('Error loading all device tracking:', err);
    return { data: [], error: err };
  }
}
