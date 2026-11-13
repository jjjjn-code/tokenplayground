import { Suspense } from "react";
import { ComponentCreator } from "../_components/ComponentCreator";

export default function CreatePage() {
  return (
    <Suspense>
      <ComponentCreator />
    </Suspense>
  );
}
