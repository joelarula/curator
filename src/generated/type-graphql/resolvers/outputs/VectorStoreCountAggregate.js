"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreCountAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let VectorStoreCountAggregate = class VectorStoreCountAggregate {
};
exports.VectorStoreCountAggregate = VectorStoreCountAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], VectorStoreCountAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], VectorStoreCountAggregate.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], VectorStoreCountAggregate.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], VectorStoreCountAggregate.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], VectorStoreCountAggregate.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], VectorStoreCountAggregate.prototype, "_all", void 0);
exports.VectorStoreCountAggregate = VectorStoreCountAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("VectorStoreCountAggregate", {})
], VectorStoreCountAggregate);
