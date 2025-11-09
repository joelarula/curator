"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreOrderByWithRelationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const SortOrderInput_1 = require("../inputs/SortOrderInput");
const SortOrder_1 = require("../../enums/SortOrder");
let VectorStoreOrderByWithRelationInput = class VectorStoreOrderByWithRelationInput {
};
exports.VectorStoreOrderByWithRelationInput = VectorStoreOrderByWithRelationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreOrderByWithRelationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreOrderByWithRelationInput.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreOrderByWithRelationInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], VectorStoreOrderByWithRelationInput.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreOrderByWithRelationInput.prototype, "createdAt", void 0);
exports.VectorStoreOrderByWithRelationInput = VectorStoreOrderByWithRelationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("VectorStoreOrderByWithRelationInput", {})
], VectorStoreOrderByWithRelationInput);
