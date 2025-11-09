"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStoreGroupBy = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GraphQLScalars = tslib_1.__importStar(require("graphql-scalars"));
const client_1 = require("@prisma/client");
const VectorStoreCountAggregate_1 = require("../outputs/VectorStoreCountAggregate");
const VectorStoreMaxAggregate_1 = require("../outputs/VectorStoreMaxAggregate");
const VectorStoreMinAggregate_1 = require("../outputs/VectorStoreMinAggregate");
let VectorStoreGroupBy = class VectorStoreGroupBy {
};
exports.VectorStoreGroupBy = VectorStoreGroupBy;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreGroupBy.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreGroupBy.prototype, "namespace", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], VectorStoreGroupBy.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => GraphQLScalars.JSONResolver, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Object)
], VectorStoreGroupBy.prototype, "metadata", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Date)
], VectorStoreGroupBy.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreCountAggregate_1.VectorStoreCountAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreCountAggregate_1.VectorStoreCountAggregate)
], VectorStoreGroupBy.prototype, "_count", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreMinAggregate_1.VectorStoreMinAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreMinAggregate_1.VectorStoreMinAggregate)
], VectorStoreGroupBy.prototype, "_min", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => VectorStoreMaxAggregate_1.VectorStoreMaxAggregate, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", VectorStoreMaxAggregate_1.VectorStoreMaxAggregate)
], VectorStoreGroupBy.prototype, "_max", void 0);
exports.VectorStoreGroupBy = VectorStoreGroupBy = tslib_1.__decorate([
    TypeGraphQL.ObjectType("VectorStoreGroupBy", {})
], VectorStoreGroupBy);
