import { getCategories } from "@/actions/categories";
import CategoryListClient from "./CategoryListClient";

export default async function CategoriasPage() {
  const categories = await getCategories();

  return (
    <div>
      <CategoryListClient initialCategories={categories} />
    </div>
  );
}
