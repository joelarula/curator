"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreMinAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let VectorStoreMinAggregate = class VectorStoreMinAggregate {
};
exports.VectorStoreMinAggregate = VectorStoreMinAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMinAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMinAggregate.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMinAggregate.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], VectorStoreMinAggregate.prototype, "createdAt", void 0);
exports.VectorStoreMinAggregate = VectorStoreMinAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("VectorStoreMinAggregate", {})
], VectorStoreMinAggregate);
