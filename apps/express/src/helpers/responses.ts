import { Response } from 'express';

// Define a standard API response structure
export interface ApiResponse<T = any> { // Export the interface
  success: boolean;
  message?: string;
  data?: T;
}

// Helper function for successful responses
export const successResponse = <T>(res: Response, data?: T, message?: string): Response<ApiResponse<T>> => {
  return res.status(200).json({
    success: true,
    message: message || 'Operation successful',
    data: data
  });
};

// Helper function for unauthorized responses
export const unauthorizedResponse = (res: Response, message?: string): Response<ApiResponse<null>> => {
  return res.status(401).json({
    success: false,
    message: message || 'Unauthorized'
  });
};
