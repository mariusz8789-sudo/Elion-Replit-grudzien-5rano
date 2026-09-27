import type { EquipmentItem, InventoryItem } from './types';

export class LabInventory {
  private readonly items = new Map<string, InventoryItem>();
  private readonly equipment = new Map<string, EquipmentItem>();

  registerItem(item: InventoryItem): void {
    if (this.items.has(item.itemId)) throw new Error(`DUPLICATE_INVENTORY_ITEM:${item.itemId}`);
    this.items.set(item.itemId, item);
  }

  registerEquipment(item: EquipmentItem): void {
    if (this.equipment.has(item.equipmentId)) throw new Error(`DUPLICATE_EQUIPMENT:${item.equipmentId}`);
    this.equipment.set(item.equipmentId, item);
  }

  consume(itemId: string, quantity = 1): InventoryItem {
    const item = this.items.get(itemId);
    if (!item) throw new Error(`INVENTORY_ITEM_NOT_FOUND:${itemId}`);
    if (quantity <= 0 || item.quantity < quantity) throw new Error(`INVENTORY_INSUFFICIENT:${itemId}`);
    const updated = { ...item, quantity: item.quantity - quantity };
    this.items.set(itemId, updated);
    return updated;
  }

  getItem(itemId: string): InventoryItem | null { return this.items.get(itemId) ?? null; }
  getEquipment(equipmentId: string): EquipmentItem | null { return this.equipment.get(equipmentId) ?? null; }
  listItems(): readonly InventoryItem[] { return [...this.items.values()]; }
  listEquipment(): readonly EquipmentItem[] { return [...this.equipment.values()]; }
}
