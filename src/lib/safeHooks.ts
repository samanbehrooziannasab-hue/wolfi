import { BACKEND } from "@/lib/backend";
import { useRestQuery, useRestMutation } from "@/lib/restApi";
import { useQuery as useConvexQuery, useMutation as useConvexMutation, useAction as useConvexAction } from "convex/react";

export function useQuery(reference: any, args?: any): any {
  if (BACKEND === "rest") return useRestQuery(reference, args);
  return useConvexQuery(reference, args);
}

export function useMutation(reference: any): any {
  if (BACKEND === "rest") return useRestMutation(reference);
  return useConvexMutation(reference);
}

export function useAction(reference: any): any {
  if (BACKEND === "rest") return useRestMutation(reference);
  return useConvexAction(reference);
}
