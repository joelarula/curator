"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreMaxAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let VectorStoreMaxAggregate = class VectorStoreMaxAggregate {
};
exports.VectorStoreMaxAggregate = VectorStoreMaxAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMaxAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMaxAggregate.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreMaxAggregate.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], VectorStoreMaxAggregate.prototype, "createdAt", void 0);
exports.VectorStoreMaxAggregate = VectorStoreMaxAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("VectorStoreMaxAggregate", {})
], VectorStoreMaxAggregate);
