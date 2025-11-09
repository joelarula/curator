"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentMaxAggregate = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let DocumentMaxAggregate = class DocumentMaxAggregate {
};
exports.DocumentMaxAggregate = DocumentMaxAggregate;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], DocumentMaxAggregate.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], DocumentMaxAggregate.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], DocumentMaxAggregate.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], DocumentMaxAggregate.prototype, "updatedAt", void 0);
exports.DocumentMaxAggregate = DocumentMaxAggregate = tslib_1.__decorate([
    TypeGraphQL.ObjectType("DocumentMaxAggregate", {})
], DocumentMaxAggregate);
