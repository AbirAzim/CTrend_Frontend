import { gql } from "@apollo/client";

export const GET_IMAGE_UPLOAD_URL = gql`
  mutation GetImageUploadUrl($filename: String!, $contentType: String!) {
    getImageUploadUrl(filename: $filename, contentType: $contentType) {
      uploadUrl
      publicUrl
      key
    }
  }
`;
